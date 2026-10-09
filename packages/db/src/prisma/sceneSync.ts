import type { db } from "./db.js";

/**
 * Sync-scene queries (Phase 15). All database initialization stays in
 * db.ts; this module only hosts the collaboration reads/writes. No raw SQL.
 *
 * Concurrency note: the ORM's conditional `where().update()` is
 * read-then-write under the hood (verified: concurrent writers all pass a
 * stale pre-check), so it cannot serialize commits. Instead, every accepted
 * commit INSERTs one `SceneRevision` row and relies on
 * `@@unique([sceneId, revision])`: exactly one concurrent writer wins each
 * revision, losers get a 23505 conflict and retry. Readers take the head
 * row; legacy scenes without rows fall back to `Scene.data`.
 */

export type SyncDb = typeof db;

export type RoomSceneRole = "owner" | "editor" | "viewer";

export interface RoomSceneAccess {
  roomId: number;
  sceneId: string;
  role: RoomSceneRole;
}

export interface RevisionHead {
  revision: number;
  data: unknown;
}

/** Room-scoped access for a sync writer: owner, member role, or null. */
export async function getRoomSceneAccess(
  store: SyncDb,
  roomId: number,
  userId: string,
): Promise<RoomSceneAccess | null> {
  const room = await store.orm!.public!.Room.where({ id: roomId }).first();
  if (!room || !room.sceneId) return null;
  if (room.adminId === userId) {
    return { roomId, sceneId: room.sceneId, role: "owner" };
  }
  const member = await store.orm!.public!.RoomMember.where({
    roomId,
    userId,
  }).first();
  if (!member) return null;
  const role = member.role;
  if (role !== "owner" && role !== "editor" && role !== "viewer") return null;
  return { roomId, sceneId: room.sceneId, role };
}

/** Which room (if any) a scene is attached to. */
export async function roomForScene(
  store: SyncDb,
  sceneId: string,
): Promise<{ roomId: number } | null> {
  const room = await store.orm!.public!.Room.where({ sceneId }).first();
  return room ? { roomId: room.id } : null;
}

/** Latest committed revision row, or null when the scene has no sync history. */
export async function readSyncHead(
  store: SyncDb,
  sceneId: string,
): Promise<RevisionHead | null> {
  const head = await store.orm!.public!.SceneRevision.where({ sceneId })
    .orderBy((revision) => revision.revision.desc())
    .first();
  if (!head) return null;
  const revision =
    typeof head.revision === "number" && Number.isSafeInteger(head.revision)
      ? head.revision
      : 0;
  return { revision, data: head.data };
}

/**
 * Append one revision. Throws a 23505 unique violation when another writer
 * won this revision first — the caller re-reads and retries.
 */
export async function insertSceneRevision(
  store: SyncDb,
  sceneId: string,
  revision: number,
  data: unknown,
  actorId: string,
): Promise<void> {
  await store.orm!.public!.SceneRevision.create({
    sceneId,
    revision,
    data: data as never,
    actorId,
  });
}

/** Drop compacted rows below the head; head itself is never deleted here. */
export async function pruneSceneRevisions(
  store: SyncDb,
  sceneId: string,
  keepFromRevision: number,
): Promise<void> {
  const rows = (await store.orm!.public!.SceneRevision.where({ sceneId })
    .select("id", "revision")
    .all()) as { id: number; revision: number }[];
  for (const row of rows) {
    if (row.revision < keepFromRevision) {
      await store.orm!.public!.SceneRevision.where({ id: row.id }).delete();
    }
  }
}

/** Retain the most recent N durable snapshots for room history. */
export async function retainLatestSceneRevisions(
  store: SyncDb,
  sceneId: string,
  keepCount: number,
): Promise<void> {
  const safeCount = Math.max(1, Math.floor(keepCount));
  const rows = (await store.orm!.public!.SceneRevision.where({ sceneId })
    .select("id", "revision")
    .orderBy((revision) => revision.revision.desc())
    .all()) as { id: number; revision: number }[];
  for (const row of rows.slice(safeCount)) {
    await store.orm!.public!.SceneRevision.where({ id: row.id }).delete();
  }
}

/** Legacy document for scenes without sync history yet. */
export async function readLegacySceneData(
  store: SyncDb,
  sceneId: string,
): Promise<{ data: unknown } | null> {
  const scene = await store.orm!.public!.Scene.where({ id: sceneId }).first();
  if (!scene) return null;
  return { data: scene.data };
}

/** Does this scene have any sync history yet? */
export async function hasSyncHistory(
  store: SyncDb,
  sceneId: string,
): Promise<boolean> {
  const head = await store.orm!.public!.SceneRevision.where({ sceneId })
    .select("id")
    .first();
  return head !== null;
}

import { Router } from "express";
import { randomInt, randomUUID } from "node:crypto";
import { db, getRoomSceneAccess, roomForScene } from "@repo/db";
import { createCollaborationService, readStoredSync } from "@repo/backend-common";
import type { RoomRedis } from "@repo/redis";

export const revisionsRouter: Router = Router();
let roomRedis: Pick<RoomRedis, "publish"> | undefined;

export function configureRevisionBroadcast(redis: Pick<RoomRedis, "publish">) {
  roomRedis = redis;
}

async function getRevisionRole(sceneId: string, userId: string) {
  const room = await roomForScene(db, sceneId);
  if (room) return (await getRoomSceneAccess(db, room.roomId, userId))?.role;
  const scene = await db.orm!.public!.Scene.where({ id: sceneId, ownerId: userId }).first();
  return scene ? "owner" : undefined;
}

interface RevisionSummary {
  revision: number;
  actorId: string;
  createdAt: string;
  elementCount: number;
  author?: string;
}

/**
 * GET /api/revisions/:sceneId
 * Lists the most recent 20 SceneRevision snapshots for a scene.
 */
revisionsRouter.get("/:sceneId", async (req, res) => {
  const sceneId = String(req.params.sceneId ?? "").trim();
  const userId = req.userId;
  if (!sceneId || !userId) {
    res.status(400).json({ error: "Invalid sceneId." });
    return;
  }

  try {
    if (!await getRevisionRole(sceneId, userId)) {
      res.status(404).json({ error: "Scene not found." });
      return;
    }

    const allRows = await db.orm!.public!.SceneRevision.where({ sceneId })
      .orderBy((r) => r.revision.desc())
      .all();
    const rows = allRows.slice(0, 20);

    const revisions: RevisionSummary[] = rows.map((row) => {
      const data = row.data as { elements?: unknown[] } | null;
      const elements = Array.isArray(data?.elements) ? data.elements : [];
      const activeCount = elements.filter(
        (el) =>
          typeof el === "object" &&
          el !== null &&
          !(el as { isDeleted?: boolean }).isDeleted,
      ).length;
      return {
        revision: Number(row.revision),
        actorId: String(row.actorId ?? ""),
        createdAt: String(row.createdAt ?? new Date().toISOString()),
        elementCount: activeCount,
      };
    });

    const authorIds = [...new Set(revisions.map((entry) => entry.actorId).filter(Boolean))];
    const authors = await Promise.all(authorIds.map(async (id) => {
      const author = await db.orm!.public!.User.where({ id }).select("name").first();
      return [id, author?.name] as const;
    }));
    const authorNames = new Map(authors);
    res.json({ sceneId, revisions: revisions.map((entry) => ({ ...entry, author: authorNames.get(entry.actorId) })) });
  } catch (error) {
    console.error("Failed to list scene revisions:", error);
    res.status(500).json({ error: "Could not load version history." });
  }
});

revisionsRouter.get("/:sceneId/:revision", async (req, res) => {
  const { sceneId } = req.params;
  const revision = Number(req.params.revision);
  if (!req.userId || !Number.isSafeInteger(revision) || revision < 0 ||
      !await getRevisionRole(sceneId, req.userId)) return res.sendStatus(404);
  const row = await db.orm!.public!.SceneRevision.where({ sceneId, revision }).first();
  if (!row) return res.sendStatus(404);
  return res.json({ elements: readStoredSync(row.data).elements });
});

/**
 * POST /api/revisions/:sceneId/:revision/restore
 * Restores a historical SceneRevision as a brand-new revision through the
 * collaboration authority so all connected WebSocket peers converge in real time.
 */
revisionsRouter.post("/:sceneId/:revision/restore", async (req, res) => {
  const sceneId = String(req.params.sceneId ?? "").trim();
  const targetRevision = Number(req.params.revision);
  const userId = req.userId;
  if (!sceneId || !userId || !Number.isSafeInteger(targetRevision) || targetRevision < 0) {
    res.status(400).json({ error: "Invalid sceneId or revision." });
    return;
  }

  try {
    if (await getRevisionRole(sceneId, userId) !== "owner") {
      res.status(404).json({ error: "Scene not found." });
      return;
    }
    const targetRow = await db.orm!.public!.SceneRevision.where({
      sceneId,
      revision: targetRevision,
    }).first();
    if (!targetRow) {
      res.status(404).json({ error: "Revision not found." });
      return;
    }

    const snapshotData = readStoredSync(targetRow.data);
    const collab = createCollaborationService({ store: db });
    const current = await collab.readSyncScene(sceneId);
    if (!current) return res.sendStatus(404);
    const desired = new Map(snapshotData.elements.filter((element) => !element.isDeleted).map((element) => [element.id, element]));
    const previous = new Map(current.elements.map((element) => [element.id, element]));
    const ids = new Set([...desired.keys(), ...current.elements.filter((element) => !element.isDeleted).map((element) => element.id)]);
    const now = Date.now();
    const restoredElements = [...ids].map((id) => {
      const target = desired.get(id);
      const before = previous.get(id);
      return {
        ...(target ?? before!),
        isDeleted: !target,
        version: Math.max(target?.version ?? 0, before?.version ?? 0, current.tombstones[id]?.version ?? 0) + 1,
        versionNonce: randomInt(2_147_483_647),
        updated: now,
      };
    });
    const mutationId = `restore-${targetRevision}-${randomUUID()}`;
    const result = await collab.applyCommit({
      sceneId,
      userId,
      role: "owner",
      elements: restoredElements,
      appState: snapshotData.appState,
      files: snapshotData.files,
      mutationId,
    });

    if (!result.saved) {
      res.status(409).json({ error: result.reason ?? "Could not restore revision." });
      return;
    }

    const room = await roomForScene(db, sceneId);
    if (room && roomRedis) {
      await roomRedis.publish({
        type: "room.broadcast",
        roomId: room.roomId,
        sceneId,
        message: { type: "elements.committed", revision: result.revision, elements: result.winners, mutationId },
      }).catch((error: unknown) => console.error("Revision broadcast failed:", error));
    }
    res.json({
      restoredFrom: targetRevision,
      newRevision: result.revision,
      elementCount: desired.size,
    });
  } catch (error) {
    console.error("Failed to restore scene revision:", error);
    res.status(500).json({ error: "Could not restore revision." });
  }
});

import {
  SYNC_MAX_COMMIT_BYTES,
  SYNC_TOMBSTONE_RETENTION_MS,
  canonicalElement,
  pruneTombstoneBodies,
  reconcileElements,
  sortElementsByOrder,
  validateSyncBatch,
  type Element,
  type NormalizedElement,
  type SyncTombstone,
  type TombstoneMap,
} from "@repo/common";
import {
  insertSceneRevision,
  pruneSceneRevisions,
  readLegacySceneData,
  readSyncHead,
  type SyncDb,
} from "@repo/db";
import type { RoomSceneRole } from "@repo/db";

/**
 * Durable collaboration authority (Phase 15), shared by the WS commit path
 * and every room-backed HTTP writer.
 *
 * Policy and orchestration live here; queries live in `packages/db`;
 * reconciliation/validation live in `packages/common`. Each accepted commit
 * reconciles only changed records against the latest stored scene and
 * appends exactly one `SceneRevision` row. `@@unique([sceneId, revision])`
 * makes concurrent appends atomic — losers get a 23505 conflict and retry
 * within a bound — because the ORM's conditional update is read-then-write
 * and cannot serialize writers (verified empirically). The server never
 * mints element versions, so replays and duplicate mutation IDs cannot
 * increment anything.
 */

export const COLLABORATION_MAX_WRITE_ATTEMPTS = 32;
export const COLLABORATION_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const COLLABORATION_MAX_FILES_PER_SCENE = 500;
const SEEN_MUTATION_CAP = 1000;

export interface StoredSyncData {
  elements: Element[];
  appState?: Record<string, unknown>;
  files?: Record<string, StoredSceneFile>;
  sync?: {
    revision?: unknown;
    tombstones?: Record<string, unknown>;
  };
}

export interface StoredSceneFile {
  id: string;
  mimeType: string;
  dataURL: string;
  created: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStoredSync(data: unknown): {
  elements: Element[];
  appState: Record<string, unknown> | undefined;
  files: Record<string, StoredSceneFile>;
  revision: number;
  tombstones: TombstoneMap;
} {
  const root = isRecord(data) ? data : {};
  const rawElements = Array.isArray(root.elements) ? root.elements : [];
  const elements = (rawElements as Element[]).filter((element) =>
    isRecord(element),
  );
  const appState = isRecord(root.appState) ? { ...root.appState } : undefined;
  const files: Record<string, StoredSceneFile> = {};
  if (isRecord(root.files)) {
    for (const [key, file] of Object.entries(root.files)) {
      if (isRecord(file)) files[key] = file as unknown as StoredSceneFile;
    }
  }
  const sync = isRecord(root.sync) ? root.sync : {};
  const revision =
    typeof sync.revision === "number" &&
    Number.isSafeInteger(sync.revision) &&
    sync.revision >= 0
      ? sync.revision
      : 0;
  const tombstones: TombstoneMap = {};
  if (isRecord(sync.tombstones)) {
    for (const [key, entry] of Object.entries(sync.tombstones)) {
      if (
        isRecord(entry) &&
        Number.isSafeInteger(entry.version) &&
        Number.isSafeInteger(entry.versionNonce) &&
        typeof entry.deletedAt === "string"
      ) {
        tombstones[key] = {
          version: entry.version as number,
          versionNonce: entry.versionNonce as number,
          deletedAt: entry.deletedAt,
        };
      }
    }
  }
  return { elements, appState, files, revision, tombstones };
}

export interface CommitInput {
  sceneId: string;
  userId: string;
  role: RoomSceneRole;
  /** Raw wire records; validated inside (defense in depth). */
  elements: unknown;
  mutationId: string;
  /** Full-document writers (HTTP autosave replacement) may carry these. */
  appState?: unknown;
  files?: unknown;
}

export interface CommitResult {
  saved: boolean;
  revision: number | null;
  /** Authoritative records for every sent ID (exact stored state). */
  winners: NormalizedElement[];
  /** Winners that differ from what the client sent (lost conflicts). */
  corrected: NormalizedElement[];
  missingFiles?: string[];
  /** True when this is a duplicate delivery of an earlier mutation. */
  replayed?: boolean;
  reason?:
    | "forbidden"
    | "invalid"
    | "too-large"
    | "missing-scene"
    | "conflict-retry-exhausted";
}

export interface AttachFileInput {
  sceneId: string;
  userId: string;
  role: RoomSceneRole;
  fileId: string;
  file: unknown;
}

export interface AttachFileResult {
  saved: boolean;
  revision?: number;
  reason?: "forbidden" | "invalid" | "too-large" | "missing-scene" | "conflict-retry-exhausted";
}

function isValidMutationId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function isUniqueViolation(error: unknown): boolean {
  // Unique violations surface as SqlQueryError (sqlState at the top, pg
  // DatabaseError with code 23505 in `cause`); walk the chain.
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    if (record.code === "23505" || record.sqlState === "23505") return true;
    const cause = record.cause;
    current = Array.isArray(cause) ? cause[0] : cause;
  }
  return false;
}

function isValidFile(file: unknown, fileId: string): file is StoredSceneFile {
  if (!isRecord(file)) return false;
  if (file.id !== fileId) return false;
  if (typeof file.mimeType !== "string" || !file.mimeType.startsWith("image/")) {
    return false;
  }
  if (
    typeof file.dataURL !== "string" ||
    !file.dataURL.startsWith("data:") ||
    file.dataURL.length > COLLABORATION_MAX_FILE_BYTES
  ) {
    return false;
  }
  return true;
}

export interface CollaborationQueries {
  readHead: (
    sceneId: string,
  ) => Promise<{ revision: number; data: unknown } | null>;
  readLegacy: (sceneId: string) => Promise<{ data: unknown } | null>;
  appendRevision: (
    sceneId: string,
    revision: number,
    data: StoredSyncData,
    actorId: string,
  ) => Promise<void>;
  pruneRevisions: (sceneId: string, keepFromRevision: number) => Promise<void>;
}

function dbQueries(store: SyncDb): CollaborationQueries {
  return {
    readHead: (sceneId) => readSyncHead(store, sceneId),
    readLegacy: (sceneId) => readLegacySceneData(store, sceneId),
    appendRevision: (sceneId, revision, data, actorId) =>
      insertSceneRevision(store, sceneId, revision, data, actorId),
    pruneRevisions: (sceneId, keepFromRevision) =>
      pruneSceneRevisions(store, sceneId, keepFromRevision),
  };
}

export interface CollaborationServiceOptions {
  store: SyncDb;
  queries?: CollaborationQueries;
  clock?: () => Date;
}

type ComputedWrite =
  | { data: StoredSyncData }
  | { missingFiles: string[] }
  | { fileTableFull: true };

export function createCollaborationService(options: CollaborationServiceOptions) {
  const queries = options.queries ?? dbQueries(options.store);
  const clock = options.clock ?? (() => new Date());
  const seenMutations = new Map<string, CommitResult>();
  const compactions = new Map<string, { revision: number }>();

  function scheduleCompaction(sceneId: string, revision: number): void {
    const active = compactions.get(sceneId);
    if (active) {
      active.revision = Math.max(active.revision, revision);
      return;
    }
    const work = { revision };
    compactions.set(sceneId, work);
    void (async () => {
      try {
        let completed: number;
        do {
          completed = work.revision;
          await queries.pruneRevisions(sceneId, completed);
        } while (work.revision > completed);
      } catch (error) {
        console.error("Scene revision compaction failed:", error);
      } finally {
        compactions.delete(sceneId);
      }
    })();
  }

  function remember(mutationId: string, result: CommitResult): CommitResult {
    seenMutations.set(mutationId, result);
    if (seenMutations.size > SEEN_MUTATION_CAP) {
      const oldest = seenMutations.keys().next();
      if (!oldest.done) seenMutations.delete(oldest.value);
    }
    return result;
  }

  /**
   * Append one revision computed from the latest state. The unique
   * constraint serializes concurrent writers: 23505 means "re-read and
   * retry", any other error propagates (caller keeps its outbox).
   */
  async function appendRevision(
    sceneId: string,
    actorId: string,
    compute: (current: { data: unknown; revision: number }) => ComputedWrite,
  ): Promise<
    | { ok: true; revision: number; data: StoredSyncData }
    | { ok: false; missingFiles: string[] }
    | { ok: false; fileTableFull: true }
    | { ok: false; missingScene: true }
    | { ok: false; exhausted: true }
  > {
    for (let attempt = 0; attempt < COLLABORATION_MAX_WRITE_ATTEMPTS; attempt += 1) {
      const head = await queries.readHead(sceneId);
      let current: { data: unknown; revision: number } | null = head
        ? { data: head.data, revision: head.revision }
        : null;
      if (!current) {
        const legacy = await queries.readLegacy(sceneId);
        if (!legacy) return { ok: false, missingScene: true };
        current = { data: legacy.data, revision: readStoredSync(legacy.data).revision };
      }
      const computed = compute(current);
      if ("missingFiles" in computed) return { ok: false, missingFiles: computed.missingFiles };
      if ("fileTableFull" in computed) return { ok: false, fileTableFull: true };
      try {
        await queries.appendRevision(sceneId, current.revision + 1, computed.data, actorId);
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Another writer won this revision; back off briefly to let the
          // thundering herd serialize, then re-read and retry.
          await new Promise((resolve) =>
            setTimeout(resolve, 5 * attempt + Math.floor(Math.random() * 10)),
          );
          continue;
        }
        throw error;
      }
      // Compaction is maintenance, not part of durable commit acceptance.
      // Coalesce concurrent writes so cleanup cannot build an unbounded queue.
      scheduleCompaction(sceneId, current.revision + 1);
      return { ok: true, revision: current.revision + 1, data: computed.data };
    }
    return { ok: false, exhausted: true };
  }

  function mergeTombstones(
    stored: TombstoneMap,
    updates: Record<string, SyncTombstone | null>,
  ): TombstoneMap {
    const tombstones: TombstoneMap = { ...stored };
    for (const [id, update] of Object.entries(updates)) {
      if (update === null) delete tombstones[id];
      else tombstones[id] = update;
    }
    return tombstones;
  }

  function stampNewTombstones(
    tombstones: TombstoneMap,
    merged: Element[],
    nowIso: string,
  ): void {
    for (const [id, entry] of Object.entries(tombstones)) {
      if (entry && entry.deletedAt === "") {
        const local = merged.find((element) => element.id === id);
        if (local?.isDeleted) {
          tombstones[id] = { ...entry, deletedAt: nowIso };
        }
      }
    }
  }

  async function applyCommit(input: CommitInput): Promise<CommitResult> {
    if (input.role !== "owner" && input.role !== "editor") {
      return { saved: false, revision: null, winners: [], corrected: [], reason: "forbidden" };
    }
    if (!isValidMutationId(input.mutationId)) {
      return { saved: false, revision: null, winners: [], corrected: [], reason: "invalid" };
    }
    const cached = seenMutations.get(input.mutationId);
    if (cached) return { ...cached, replayed: true };
    let payloadBytes = 0;
    try {
      payloadBytes = JSON.stringify(input.elements)?.length ?? 0;
    } catch {
      return { saved: false, revision: null, winners: [], corrected: [], reason: "invalid" };
    }
    if (payloadBytes > SYNC_MAX_COMMIT_BYTES) {
      return { saved: false, revision: null, winners: [], corrected: [], reason: "too-large" };
    }
    const batch = validateSyncBatch(input.elements);
    if (!batch.ok) {
      return { saved: false, revision: null, winners: [], corrected: [], reason: "invalid" };
    }
    const sentById = new Map(batch.elements.map((element) => [element.id, element]));
    const sentCanonical = new Map(
      batch.elements.map((element) => [element.id, canonicalElement(element)]),
    );

    const written = await appendRevision(input.sceneId, input.userId, (current) => {
      const stored = readStoredSync(current.data);

      const referencedFiles = new Set<string>();
      for (const element of batch.elements) {
        if (element.type === "image") {
          referencedFiles.add((element as unknown as { fileId: string }).fileId);
        }
      }
      const absent = [...referencedFiles].filter((fileId) => !stored.files[fileId]);
      if (absent.length > 0) return { missingFiles: absent.sort() };

      const merged = reconcileElements(stored.elements, batch.elements, stored.tombstones);
      const tombstones = mergeTombstones(stored.tombstones, merged.tombstoneUpdates);
      const now = clock();
      stampNewTombstones(tombstones, merged.merged, now.toISOString());
      const pruned = pruneTombstoneBodies(
        merged.merged,
        tombstones,
        now.getTime(),
        SYNC_TOMBSTONE_RETENTION_MS,
      );

      let appState = stored.appState;
      if (isRecord(input.appState)) appState = { ...input.appState };
      const files = { ...stored.files };
      if (isRecord(input.files)) {
        for (const [key, file] of Object.entries(input.files)) {
          if (isRecord(file)) files[key] = file as unknown as StoredSceneFile;
        }
      }

      return {
        data: {
          elements: sortElementsByOrder(pruned.elements),
          ...(appState ? { appState } : {}),
          ...(Object.keys(files).length > 0 ? { files } : {}),
          sync: { revision: current.revision + 1, tombstones },
        },
      };
    });

    if (!written.ok && "missingScene" in written) {
      return { saved: false, revision: null, winners: [], corrected: [], reason: "missing-scene" };
    }
    if (!written.ok && "missingFiles" in written) {
      return {
        saved: false,
        revision: null,
        winners: [],
        corrected: [],
        missingFiles: written.missingFiles,
      };
    }
    if (!written.ok) {
      return { saved: false, revision: null, winners: [], corrected: [], reason: "conflict-retry-exhausted" };
    }

    const winners: NormalizedElement[] = [];
    const corrected: NormalizedElement[] = [];
    const storedById = new Map(written.data.elements.map((element) => [element.id, element]));
    for (const id of sentById.keys()) {
      const authoritative = storedById.get(id);
      if (authoritative) {
        const normalized = authoritative as NormalizedElement;
        winners.push(normalized);
        if (canonicalElement(normalized) !== sentCanonical.get(id)) {
          corrected.push(normalized);
        }
      } else {
        // Pruned as an old tombstone body in this same write: the deletion
        // stands; report the tombstone as the authoritative state.
        const tombstone = written.data.sync?.tombstones?.[id] as SyncTombstone | undefined;
        if (tombstone) {
          const sent = sentById.get(id)!;
          const marker = { ...sent, isDeleted: true } as NormalizedElement;
          winners.push(marker);
          corrected.push(marker);
        }
      }
    }
    return remember(input.mutationId, {
      saved: true,
      revision: written.revision,
      winners,
      corrected,
      replayed: false,
    });
  }

  async function attachFile(input: AttachFileInput): Promise<AttachFileResult> {
    if (input.role !== "owner" && input.role !== "editor") {
      return { saved: false, reason: "forbidden" };
    }
    if (typeof input.fileId !== "string" || input.fileId.length === 0) {
      return { saved: false, reason: "invalid" };
    }
    if (!isValidFile(input.file, input.fileId)) {
      const tooLarge =
        isRecord(input.file) &&
        typeof input.file.dataURL === "string" &&
        input.file.dataURL.startsWith("data:") &&
        input.file.dataURL.length > COLLABORATION_MAX_FILE_BYTES;
      return { saved: false, reason: tooLarge ? "too-large" : "invalid" };
    }
    const written = await appendRevision(input.sceneId, input.userId, (current) => {
      const stored = readStoredSync(current.data);
      if (Object.keys(stored.files).length >= COLLABORATION_MAX_FILES_PER_SCENE) {
        return { fileTableFull: true as const };
      }
      const files = { ...stored.files, [input.fileId]: input.file as StoredSceneFile };
      return {
        data: {
          elements: stored.elements,
          ...(stored.appState ? { appState: stored.appState } : {}),
          files,
          sync: { revision: current.revision + 1, tombstones: stored.tombstones },
        },
      };
    });
    if (!written.ok && "fileTableFull" in written) {
      return { saved: false, reason: "too-large" };
    }
    if (!written.ok && "missingScene" in written) {
      return { saved: false, reason: "missing-scene" };
    }
    if (!written.ok) {
      return { saved: false, reason: "conflict-retry-exhausted" };
    }
    return { saved: true, revision: written.revision };
  }

  async function readSyncScene(sceneId: string): Promise<{
    elements: NormalizedElement[];
    tombstones: TombstoneMap;
    revision: number;
    data: StoredSyncData;
  } | null> {
    const head = await queries.readHead(sceneId);
    const legacy = head ? null : await queries.readLegacy(sceneId);
    if (!head && !legacy) return null;
    const data = head ? head.data : legacy!.data;
    const revision = head ? head.revision : readStoredSync(data).revision;
    const stored = readStoredSync(data);
    const merged = reconcileElements([], stored.elements, {});
    const elements = sortElementsByOrder(merged.merged) as NormalizedElement[];
    return {
      elements,
      tombstones: stored.tombstones,
      revision,
      data: {
        elements,
        ...(stored.appState ? { appState: stored.appState } : {}),
        ...(Object.keys(stored.files).length > 0 ? { files: stored.files } : {}),
        sync: { revision, tombstones: stored.tombstones },
      },
    };
  }

  return { applyCommit, attachFile, readSyncScene };
}

export type CollaborationService = ReturnType<typeof createCollaborationService>;

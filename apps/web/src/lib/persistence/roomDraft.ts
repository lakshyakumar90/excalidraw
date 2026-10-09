import type { Element, TombstoneMap } from "@repo/common";
import {
  ROOM_DRAFT_STORE,
  SYNC_OUTBOX_STORE,
  readStorageRequest,
  runStorageTransaction,
} from "./indexedDb";

/**
 * Room-scoped local drafts and the committed-edit outbox (Phase 15).
 *
 * Keys scope by account, room, and scene so a draft from another
 * room/account can never reconcile into this room, and the guest `current`
 * scene plus personal scenes are never touched. The outbox survives refresh:
 * entries persist before relying on socket delivery and replay with the same
 * mutation ID and metadata until durable acknowledgement.
 */

export interface RoomDraft {
  key: string;
  elements: Element[];
  tombstones: TombstoneMap;
  revision: number;
  updatedAt: number;
}

export interface OutboxEntry {
  mutationId: string;
  roomKey: string;
  elements: Element[];
  baseRevision: number;
  createdAt: number;
  attempts: number;
}

export function draftKey(accountId: string, roomId: string, sceneId: string): string {
  return `${accountId}:${roomId}:${sceneId}`;
}

export interface DraftStore {
  load: (key: string) => Promise<RoomDraft | null>;
  save: (draft: RoomDraft) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

export interface OutboxStore {
  list: (roomKey: string) => Promise<OutboxEntry[]>;
  put: (entry: OutboxEntry) => Promise<void>;
  remove: (mutationId: string) => Promise<void>;
}

function cloneDraft(draft: RoomDraft): RoomDraft {
  return {
    ...draft,
    elements: structuredClone(draft.elements),
    tombstones: structuredClone(draft.tombstones),
  };
}

function cloneEntry(entry: OutboxEntry): OutboxEntry {
  return { ...entry, elements: structuredClone(entry.elements) };
}

export function createIndexedDbDraftStore(): DraftStore {
  return {
    load: async (key) =>
      runStorageTransaction([ROOM_DRAFT_STORE], "readonly", async (transaction) => {
        const result = await readStorageRequest(
          transaction.objectStore(ROOM_DRAFT_STORE).get(key),
        );
        return (result as RoomDraft | undefined) ?? null;
      }),
    save: async (draft) =>
      runStorageTransaction([ROOM_DRAFT_STORE], "readwrite", async (transaction) => {
        transaction.objectStore(ROOM_DRAFT_STORE).put(cloneDraft(draft));
      }),
    remove: async (key) =>
      runStorageTransaction([ROOM_DRAFT_STORE], "readwrite", async (transaction) => {
        transaction.objectStore(ROOM_DRAFT_STORE).delete(key);
      }),
  };
}

export function createIndexedDbOutboxStore(): OutboxStore {
  return {
    list: async (roomKey) =>
      runStorageTransaction([SYNC_OUTBOX_STORE], "readonly", async (transaction) => {
        const index = transaction.objectStore(SYNC_OUTBOX_STORE).index("by-room");
        const result = await readStorageRequest(index.getAll(roomKey));
        const entries = (result as OutboxEntry[] | undefined) ?? [];
        return entries
          .map(cloneEntry)
          .sort((a, b) => a.createdAt - b.createdAt || (a.mutationId < b.mutationId ? -1 : 1));
      }),
    put: async (entry) =>
      runStorageTransaction([SYNC_OUTBOX_STORE], "readwrite", async (transaction) => {
        transaction.objectStore(SYNC_OUTBOX_STORE).put(cloneEntry(entry));
      }),
    remove: async (mutationId) =>
      runStorageTransaction([SYNC_OUTBOX_STORE], "readwrite", async (transaction) => {
        transaction.objectStore(SYNC_OUTBOX_STORE).delete(mutationId);
      }),
  };
}

/** In-memory stores for tests (same interface, deterministic ordering). */
export function createMemoryDraftStore(): DraftStore & { entries: Map<string, RoomDraft> } {
  const entries = new Map<string, RoomDraft>();
  return {
    entries,
    load: async (key) => {
      const draft = entries.get(key);
      return draft ? cloneDraft(draft) : null;
    },
    save: async (draft) => {
      entries.set(draft.key, cloneDraft(draft));
    },
    remove: async (key) => {
      entries.delete(key);
    },
  };
}

export function createMemoryOutboxStore(): OutboxStore & { entries: Map<string, OutboxEntry> } {
  const entries = new Map<string, OutboxEntry>();
  return {
    entries,
    list: async (roomKey) =>
      [...entries.values()]
        .filter((entry) => entry.roomKey === roomKey)
        .map(cloneEntry)
        .sort((a, b) => a.createdAt - b.createdAt || (a.mutationId < b.mutationId ? -1 : 1)),
    put: async (entry) => {
      entries.set(entry.mutationId, cloneEntry(entry));
    },
    remove: async (mutationId) => {
      entries.delete(mutationId);
    },
  };
}

import { describe, expect, it } from "vitest";
import {
  createCollaborationService,
  type CollaborationQueries,
} from "./collaboration.js";

function rect(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    version: 1,
    versionNonce: 1,
    ...overrides,
  };
}

interface FakeRow {
  data: unknown;
  revision: number;
}

function uniqueViolation(): Error {
  return Object.assign(new Error("duplicate key"), { code: "23505" });
}

function fakeStore(
  seed?: { data: unknown } | null,
  behavior?: { alwaysConflict?: boolean; throwOnRead?: boolean },
) {
  // Undefined seed: an empty legacy scene with no sync history. Null: missing.
  let legacy: { data: unknown } | null =
    seed === undefined
      ? { data: { elements: [], sync: { revision: 0, tombstones: {} } } }
      : seed;
  const rows = new Map<number, unknown>();
  let head = -1;
  let writes = 0;
  const queries: CollaborationQueries = {
    readHead: async () => {
      if (behavior?.throwOnRead) throw new Error("database is down");
      if (head < 0) return null;
      return { revision: head, data: structuredClone(rows.get(head)) };
    },
    readLegacy: async () => {
      if (behavior?.throwOnRead) throw new Error("database is down");
      return legacy ? { data: structuredClone(legacy.data) } : null;
    },
    appendRevision: async (_sceneId, revision, data) => {
      if (behavior?.alwaysConflict) throw uniqueViolation();
      if (rows.has(revision)) throw uniqueViolation();
      writes += 1;
      rows.set(revision, structuredClone(data));
      head = revision;
    },
    pruneRevisions: async (_sceneId, keepFrom) => {
      for (const revision of [...rows.keys()]) {
        if (revision < keepFrom) rows.delete(revision);
      }
    },
  };
  return {
    queries,
    get writes() {
      return writes;
    },
    get data() {
      const current = head >= 0 ? rows.get(head) : legacy?.data;
      return current as Record<string, unknown>;
    },
  };
}

const serviceWith = (store: ReturnType<typeof fakeStore>) =>
  createCollaborationService({
    store: undefined as never,
    queries: store.queries,
    clock: () => new Date("2026-10-20T00:00:00.000Z"),
  });

it("accepts a durable write without waiting for revision cleanup", async () => {
  const store = fakeStore();
  let releaseCleanup!: () => void;
  store.queries.pruneRevisions = () => new Promise<void>((resolve) => { releaseCleanup = resolve; });
  const result = await serviceWith(store).applyCommit({
    sceneId: "s1", userId: "u1", role: "editor", elements: [rect("a")], mutationId: "fast-1",
  });
  expect(result.saved).toBe(true);
  expect(store.writes).toBe(1);
  releaseCleanup();
});

it("accepts edits into the live store without claiming Postgres durability", async () => {
  const postgres = fakeStore();
  let live: { revision: number; data: Record<string, unknown> } | null = null;
  const liveStore = {
    readSnapshot: async () =>
      live
        ? {
            sceneId: "s-live",
            revision: live.revision,
            actorId: "u1",
            data: live.data as Record<string, unknown> & { elements: unknown[] },
            persistedRevision: 0,
            firstDirtyAt: 1,
            lastDirtyAt: 1,
          }
        : null,
    writeSnapshot: async (
      _sceneId: string,
      expected: number,
      revision: number,
      _actorId: string,
      data: Record<string, unknown> & { elements: unknown[] },
    ) => {
      if ((live?.revision ?? 0) !== expected) return false;
      live = { revision, data };
      return true;
    },
  };
  const service = createCollaborationService({
    store: undefined as never,
    queries: postgres.queries,
    liveStore: liveStore as never,
  });
  const result = await service.applyCommit({
    sceneId: "s-live",
    userId: "u1",
    role: "editor",
    elements: [rect("live")],
    mutationId: "live-1",
  });
  expect(result).toMatchObject({ saved: true, persisted: false, revision: 1 });
  expect(postgres.writes).toBe(0);
  expect((await service.readSyncScene("s-live"))?.elements).toHaveLength(1);
});

describe("applyCommit authorization and validation", () => {
  it("rejects viewer commits without touching storage", async () => {
    const store = fakeStore();
    const service = serviceWith(store);
    const result = await service.applyCommit({
      sceneId: "s1",
      userId: "u1",
      role: "viewer",
      elements: [rect("a")],
      mutationId: "m1",
    });
    expect(result).toMatchObject({ saved: false, reason: "forbidden" });
    expect(store.writes).toBe(0);
  });

  it("rejects invalid, empty, duplicate, and oversized commits", async () => {
    const store = fakeStore();
    const service = serviceWith(store);
    const base = { sceneId: "s1", userId: "u1", role: "editor" as const };
    expect(
      await service.applyCommit({ ...base, elements: [{ ...rect("a"), version: 0 }], mutationId: "m1" }),
    ).toMatchObject({ reason: "invalid" });
    expect(
      await service.applyCommit({ ...base, elements: [], mutationId: "m2" }),
    ).toMatchObject({ reason: "invalid" });
    expect(
      await service.applyCommit({
        ...base,
        elements: [rect("a"), rect("a")],
        mutationId: "m3",
      }),
    ).toMatchObject({ reason: "invalid" });
    expect(
      await service.applyCommit({
        ...base,
        elements: [rect("a", { text: "x".repeat(300 * 1024), type: "text", fontSize: 10, fontFamily: "f", textAlign: "left", verticalAlign: "top" })],
        mutationId: "m4",
      }),
    ).toMatchObject({ reason: "too-large" });
    expect(
      await service.applyCommit({ ...base, elements: [rect("a")], mutationId: "" }),
    ).toMatchObject({ reason: "invalid" });
    expect(store.writes).toBe(0);
  });

  it("reports a missing scene", async () => {
    const store = fakeStore(null);
    const service = serviceWith(store);
    expect(
      await service.applyCommit({
        sceneId: "missing",
        userId: "u1",
        role: "editor",
        elements: [rect("a")],
        mutationId: "m1",
      }),
    ).toMatchObject({ saved: false, reason: "missing-scene" });
  });

  it("propagates database failure without writing", async () => {
    const store = fakeStore(undefined, { throwOnRead: true });
    const service = serviceWith(store);
    await expect(
      service.applyCommit({
        sceneId: "s1",
        userId: "u1",
        role: "editor",
        elements: [rect("a")],
        mutationId: "m1",
      }),
    ).rejects.toThrow("database is down");
    expect(store.writes).toBe(0);
  });

  it("gives up after bounded write retries", async () => {
    const store = fakeStore(undefined, { alwaysConflict: true });
    const service = serviceWith(store);
    expect(
      await service.applyCommit({
        sceneId: "s1",
        userId: "u1",
        role: "editor",
        elements: [rect("a")],
        mutationId: "m1",
      }),
    ).toMatchObject({ saved: false, reason: "conflict-retry-exhausted" });
  });
});

describe("applyCommit merge semantics", () => {
  it("persists new elements with a revision bump and no corrections", async () => {
    const store = fakeStore();
    const service = serviceWith(store);
    const result = await service.applyCommit({
      sceneId: "s1",
      userId: "u1",
      role: "editor",
      elements: [rect("a", { version: 2, versionNonce: 7, x: 5 })],
      mutationId: "m1",
    });
    expect(result.saved).toBe(true);
    expect(result.revision).toBe(1);
    expect(result.corrected).toEqual([]);
    expect(result.winners).toHaveLength(1);
    expect(store.data).toMatchObject({
      sync: { revision: 1 },
      elements: [{ id: "a", version: 2, x: 5 }],
    });
  });

  it("replays of the same mutation ID never write twice", async () => {
    const store = fakeStore();
    const service = serviceWith(store);
    const input = {
      sceneId: "s1",
      userId: "u1",
      role: "editor" as const,
      elements: [rect("a", { version: 2, versionNonce: 7 })],
      mutationId: "m1",
    };
    const first = await service.applyCommit(input);
    const second = await service.applyCommit(input);
    expect(second.replayed).toBe(true);
    expect({ ...second, replayed: false }).toEqual({ ...first, replayed: false });
    expect(store.writes).toBe(1);
  });

  it("returns corrections when the client lost a conflict", async () => {
    const store = fakeStore({
      data: {
        elements: [rect("a", { version: 5, versionNonce: 9, x: 100 })],
        sync: { revision: 3, tombstones: {} },
      },
    });
    const service = serviceWith(store);
    const result = await service.applyCommit({
      sceneId: "s1",
      userId: "u1",
      role: "editor",
      elements: [rect("a", { version: 3, versionNonce: 1, x: 1 })],
      mutationId: "m1",
    });
    expect(result.saved).toBe(true);
    expect(result.revision).toBe(4);
    expect(result.corrected.map((element) => element.id)).toEqual(["a"]);
    expect(result.winners[0]).toMatchObject({ version: 5, x: 100 });
  });

  it("requires referenced image files before reporting saved", async () => {
    const store = fakeStore();
    const service = serviceWith(store);
    const image = {
      id: "img1",
      type: "image",
      x: 0,
      y: 0,
      fileId: "file-9",
      version: 2,
      versionNonce: 2,
    };
    const missing = await service.applyCommit({
      sceneId: "s1",
      userId: "u1",
      role: "editor",
      elements: [image],
      mutationId: "m1",
    });
    expect(missing).toMatchObject({ saved: false, missingFiles: ["file-9"] });
    expect(store.writes).toBe(0);

    const attached = await service.attachFile({
      sceneId: "s1",
      userId: "u1",
      role: "editor",
      fileId: "file-9",
      file: {
        id: "file-9",
        mimeType: "image/png",
        dataURL: "data:image/png;base64,AAA",
        created: 1,
      },
    });
    expect(attached).toMatchObject({ saved: true });
    const retry = await service.applyCommit({
      sceneId: "s1",
      userId: "u1",
      role: "editor",
      elements: [image],
      mutationId: "m1",
    });
    expect(retry.saved).toBe(true);
  });

  it("preserves files, app state, and tombstones across merges", async () => {
    const file = { id: "f1", mimeType: "image/png", dataURL: "data:,x", created: 1 };
    const store = fakeStore({
      data: {
        elements: [rect("a", { version: 2, versionNonce: 2 })],
        appState: { scrollX: 3 },
        files: { f1: file },
        sync: { revision: 2, tombstones: {} },
      },
    });
    const service = serviceWith(store);
    const result = await service.applyCommit({
      sceneId: "s1",
      userId: "u1",
      role: "editor",
      elements: [rect("b", { version: 2, versionNonce: 2 })],
      mutationId: "m1",
      appState: { scrollX: 8 },
    });
    expect(result.saved).toBe(true);
    expect(store.data).toMatchObject({
      appState: { scrollX: 8 },
      files: { f1: file },
      sync: { revision: 3 },
    });
  });

  it("prunes old tombstone bodies while keeping deletion metadata", async () => {
    const store = fakeStore({
      data: {
        elements: [rect("old", { version: 2, versionNonce: 2, isDeleted: true })],
        sync: {
          revision: 1,
          tombstones: {
            old: { version: 2, versionNonce: 2, deletedAt: "2026-10-01T00:00:00.000Z" },
          },
        },
      },
    });
    const service = serviceWith(store);
    const result = await service.applyCommit({
      sceneId: "s1",
      userId: "u1",
      role: "editor",
      elements: [rect("fresh", { version: 2, versionNonce: 2 })],
      mutationId: "m1",
    });
    expect(result.saved).toBe(true);
    const data = store.data as {
      elements: { id: string }[];
      sync: { tombstones: Record<string, unknown> };
    };
    expect(data.elements.map((element) => element.id)).toEqual(["fresh"]);
    expect(data.sync.tombstones["old"]).toMatchObject({ version: 2 });
  });
});

describe("attachFile", () => {
  it("rejects forbidden, invalid, and oversized uploads", async () => {
    const store = fakeStore();
    const service = serviceWith(store);
    expect(
      await service.attachFile({
        sceneId: "s1",
        userId: "u1",
        role: "viewer",
        fileId: "f1",
        file: { id: "f1", mimeType: "image/png", dataURL: "data:,x", created: 1 },
      }),
    ).toMatchObject({ saved: false, reason: "forbidden" });
    expect(
      await service.attachFile({
        sceneId: "s1",
        userId: "u1",
        role: "editor",
        fileId: "f1",
        file: { id: "other", mimeType: "image/png", dataURL: "data:,x", created: 1 },
      }),
    ).toMatchObject({ saved: false, reason: "invalid" });
    expect(
      await service.attachFile({
        sceneId: "s1",
        userId: "u1",
        role: "editor",
        fileId: "f1",
        file: { id: "f1", mimeType: "text/plain", dataURL: "data:,x", created: 1 },
      }),
    ).toMatchObject({ saved: false, reason: "invalid" });
    expect(store.writes).toBe(0);
  });
});

describe("pruning and stale replay", () => {
  it("keeps pruned deletions deleted against older live replays", async () => {
    const store = fakeStore({
      data: {
        elements: [rect("old", { version: 2, versionNonce: 2, isDeleted: true })],
        sync: {
          revision: 1,
          tombstones: {
            old: { version: 2, versionNonce: 2, deletedAt: "2026-10-01T00:00:00.000Z" },
          },
        },
      },
    });
    const service = serviceWith(store);
    // A stale offline draft replays the long-deleted live body.
    const result = await service.applyCommit({
      sceneId: "s1",
      userId: "u1",
      role: "editor",
      elements: [rect("old", { version: 1, versionNonce: 1, x: 5 })],
      mutationId: "stale-replay",
    });
    expect(result.saved).toBe(true);
    const data = store.data as {
      elements: { id: string }[];
      sync: { tombstones: Record<string, unknown> };
    };
    // The body stays pruned and the tombstone entry survives the write.
    expect(data.elements.map((element) => element.id)).not.toContain("old");
    expect(data.sync.tombstones["old"]).toMatchObject({ version: 2 });
    expect(result.winners).toHaveLength(1);
    expect(result.winners[0]).toMatchObject({ id: "old", isDeleted: true });
    expect(result.corrected).toHaveLength(1);
  });

  it("lets a higher-version undelete win atomically with its tombstone", async () => {
    const store = fakeStore({
      data: {
        elements: [rect("back", { version: 2, versionNonce: 2, isDeleted: true })],
        sync: {
          revision: 1,
          tombstones: {
            back: { version: 2, versionNonce: 2, deletedAt: "2026-10-01T00:00:00.000Z" },
          },
        },
      },
    });
    const service = serviceWith(store);
    const result = await service.applyCommit({
      sceneId: "s1",
      userId: "u1",
      role: "editor",
      elements: [rect("back", { version: 3, versionNonce: 1, isDeleted: false })],
      mutationId: "undelete",
    });
    expect(result.saved).toBe(true);
    expect(result.corrected).toEqual([]);
    const data = store.data as {
      elements: { id: string; isDeleted: boolean }[];
      sync: { tombstones: Record<string, unknown> };
    };
    expect(
      data.elements.find((element) => element.id === "back")?.isDeleted,
    ).toBe(false);
    expect(data.sync.tombstones["back"]).toBeUndefined();
  });
});

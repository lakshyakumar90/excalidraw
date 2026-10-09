import { afterEach, describe, expect, it } from "vitest";
import { Scene } from "@repo/engine";
import type {
  NormalizedElement,
  ServerToClientCollabMessage,
  ServerToClientPresenceMessage,
} from "@repo/common";
import { validateSyncElement } from "@repo/common";
import type { PresenceConnection } from "@/lib/presence/presenceSocket";
import type { PresenceSocketEvents } from "@/lib/presence/presenceSocket";
import {
  createMemoryDraftStore,
  createMemoryOutboxStore,
  draftKey,
} from "@/lib/persistence/roomDraft";
import { RoomSync, type HttpRoomScene } from "./roomSync";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function rect(id: string, overrides: Record<string, unknown> = {}): NormalizedElement {
  const result = validateSyncElement({
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    version: 2,
    versionNonce: 2,
    ...overrides,
  });
  if (!result.ok) throw new Error(`test element ${id} invalid`);
  return result.element;
}

class FakeConnection {
  static instances: FakeConnection[] = [];
  static reset() {
    FakeConnection.instances = [];
  }
  sent: Record<string, unknown>[] = [];
  open = false;
  constructor(readonly events: PresenceSocketEvents) {
    FakeConnection.instances.push(this);
  }
  start() {}
  get isOpen() {
    return this.open;
  }
  send(message: Record<string, unknown>) {
    if (this.open) this.sent.push(message);
  }
  close() {
    this.open = false;
  }
  goLive() {
    this.open = true;
    this.events.onStatus("live", null);
  }
  drop() {
    this.open = false;
    this.events.onStatus("reconnecting", null);
  }
  receiveCollab(message: ServerToClientCollabMessage) {
    this.events.onCollabMessage(message);
  }
  receivePresence(message: ServerToClientPresenceMessage) {
    this.events.onMessage(message);
  }
}

const syncs: RoomSync[] = [];
afterEach(async () => {
  for (const sync of syncs.splice(0)) sync.stop();
  FakeConnection.reset();
});

interface Harness {
  sync: RoomSync;
  scene: Scene;
  drafts: ReturnType<typeof createMemoryDraftStore>;
  outboxStore: ReturnType<typeof createMemoryOutboxStore>;
  conn: () => FakeConnection;
}

function harness(
  http: HttpRoomScene,
  clockValue = 1000,
  fileSync?: {
    upload: (elements: readonly never[]) => Promise<void>;
    download: (elements: readonly never[]) => Promise<void>;
    seedKnown: (fileIds: readonly string[]) => void;
  },
) {
  const scene = new Scene();
  const drafts = createMemoryDraftStore();
  const outboxStore = createMemoryOutboxStore();
  const clock = clockValue;
  const sync = new RoomSync({
    roomId: "1",
    sceneId: "scene-1",
    userId: "alice",
    baseUrl: "ws://local",
    scene,
    createConnection: (events) =>
      new FakeConnection(events) as unknown as PresenceConnection,
    getTicket: async () => "ticket",
    drafts,
    outboxStore,
    clock: () => clock,
    ...(fileSync ? { fileSync: fileSync as never } : {}),
  });
  syncs.push(sync);
  return {
    sync,
    scene,
    drafts,
    outboxStore,
    conn: () => FakeConnection.instances.at(-1)!,
  };
}

async function startWithHttp(h: Harness, http: HttpRoomScene) {
  await h.sync.initializeWithHttpScene(http);
  h.sync.start();
  h.conn().goLive();
  await sleep(5);
}

/** Complete the pending sync request with a (possibly empty) snapshot. */
async function completeSync(
  h: Harness,
  snapshot: Partial<{
    revision: number;
    elements: NormalizedElement[];
    tombstones: Record<string, { version: number; versionNonce: number; deletedAt: string }>;
  }> = {},
) {
  const requestId = (
    h.conn().sent.find((message) => message.type === "scene.sync.request") as {
      requestId: string;
    }
  ).requestId;
  h.conn().receiveCollab({
    type: "scene.sync.snapshot",
    requestId,
    revision: snapshot.revision ?? 0,
    elements: snapshot.elements ?? [],
    tombstones: snapshot.tombstones ?? {},
  });
  await sleep(5);
}

const HTTP_EMPTY: HttpRoomScene = { elements: [], tombstones: {}, revision: 0 };

it("shows finished geometry before saving without persisting the pending overlay", async () => {
  const h = harness(HTTP_EMPTY);
  await startWithHttp(h, HTTP_EMPTY);
  await completeSync(h);
  const element = rect("instant", { x: 42, strokeColor: "#ff0000" });
  h.conn().receiveCollab({
    type: "elements.pending", mutationId: "pending-1", connectionId: "bob-tab",
    userId: "bob", elements: [element],
  });
  expect(h.sync.previews.getPreviews()[0]?.elements[0]?.x).toBe(42);
  expect(h.scene.getElement("instant")).toBeUndefined();
  await h.sync.flushDraft();
  expect((await h.drafts.load(draftKey("alice", "1", "scene-1")))?.elements).toEqual([]);
  h.conn().receiveCollab({
    type: "elements.committed", mutationId: "pending-1", connectionId: "bob-tab",
    userId: "bob", revision: 1, elements: [element],
  });
  expect(h.scene.getElement("instant")?.x).toBe(42);
  expect(h.sync.previews.size).toBe(0);
});

describe("RoomSync initial sync", () => {
  it("seeds the draft, requests a snapshot, and merges it", async () => {
    const h = harness(HTTP_EMPTY);
    await startWithHttp(h, {
      elements: [rect("a", { version: 2, versionNonce: 2 })],
      tombstones: {},
      revision: 4,
    });
    expect(
      h.conn().sent.filter((message) => message.type === "scene.sync.request"),
    ).toHaveLength(1);
    h.conn().receiveCollab({
      type: "scene.sync.snapshot",
      requestId: (h.conn().sent[0] as { requestId: string }).requestId,
      revision: 4,
      elements: [rect("a", { version: 2, versionNonce: 2 }) as NormalizedElement],
      tombstones: {},
    });
    await sleep(5);
    expect(h.sync.getSnapshot().scene).toBe("synced");
    expect(h.sync.getSnapshot().revision).toBe(4);
    expect(h.scene.getElements().map((element) => element.id)).toEqual(["a"]);
    await h.sync.flushDraft();
    const draft = await h.drafts.load(draftKey("alice", "1", "scene-1"));
    expect(draft?.revision).toBe(4);
  });

  it("preserves draft offline commits over a stale HTTP base", async () => {
    const h = harness(HTTP_EMPTY);
    // Seed a draft with an offline commit (higher version than HTTP).
    await h.drafts.save({
      key: draftKey("alice", "1", "scene-1"),
      elements: [rect("a", { version: 5, versionNonce: 5, x: 50 })],
      tombstones: {},
      revision: 6,
      updatedAt: 1,
    });
    await startWithHttp(h, {
      elements: [rect("a", { version: 2, versionNonce: 2, x: 1 })],
      tombstones: {},
      revision: 2,
    });
    expect(h.scene.getElement("a")).toMatchObject({ version: 5, x: 50 });
  });

  it("ignores stale snapshots from a previous generation", async () => {
    const h = harness(HTTP_EMPTY);
    await startWithHttp(h, HTTP_EMPTY);
    const firstRequest = (
      h.conn().sent.find((message) => message.type === "scene.sync.request") as {
        requestId: string;
      }
    ).requestId;
    h.conn().drop();
    h.conn().goLive();
    await sleep(5);
    const requests = h.conn().sent.filter(
      (message) => message.type === "scene.sync.request",
    ) as { requestId: string }[];
    expect(requests).toHaveLength(2);
    // The late first-generation snapshot must not wipe newer state.
    h.scene.addElement(rect("local") as never);
    h.conn().receiveCollab({
      type: "scene.sync.snapshot",
      requestId: firstRequest,
      revision: 0,
      elements: [],
      tombstones: {},
    });
    await sleep(5);
    expect(h.scene.getElement("local")).toBeDefined();
  });

  it("assembles chunked snapshots in order", async () => {
    const h = harness(HTTP_EMPTY);
    await startWithHttp(h, HTTP_EMPTY);
    const requestId = (
      h.conn().sent.find((message) => message.type === "scene.sync.request") as {
        requestId: string;
      }
    ).requestId;
    const first = rect("c1") as NormalizedElement;
    const second = rect("c2") as NormalizedElement;
    h.conn().receiveCollab({
      type: "scene.sync.snapshot",
      requestId,
      revision: 2,
      elements: [],
      tombstones: {},
      chunks: { count: 2 },
    });
    await sleep(5);
    expect(h.scene.getElements()).toHaveLength(0);
    h.conn().receiveCollab({
      type: "scene.sync.chunk",
      requestId,
      index: 1,
      count: 2,
      elements: [second],
    });
    await sleep(5);
    expect(h.scene.getElements()).toHaveLength(0);
    h.conn().receiveCollab({
      type: "scene.sync.chunk",
      requestId,
      index: 0,
      count: 2,
      elements: [first],
    });
    await sleep(5);
    expect(h.scene.getElements().map((element) => element.id).sort()).toEqual([
      "c1",
      "c2",
    ]);
  });
});

describe("RoomSync outbox and acknowledgements", () => {
  it("enqueues local commits durably and sends them when live", async () => {
    const h = harness(HTTP_EMPTY);
    await startWithHttp(h, HTTP_EMPTY);
    await completeSync(h);
    h.scene.addElement(rect("a") as never);
    h.scene.commitChanges(["a"], "local");
    await sleep(5);
    const stored = await h.outboxStore.list(draftKey("alice", "1", "scene-1"));
    expect(stored).toHaveLength(1);
    const commit = h.conn().sent.find((message) => message.type === "elements.commit") as {
      mutationId: string;
      elements: { id: string }[];
    };
    expect(commit.elements.map((element) => element.id)).toEqual(["a"]);
    expect(stored[0]?.mutationId).toBe(commit.mutationId);
    expect(h.sync.getSnapshot().scene).toBe("syncing");

    h.conn().receiveCollab({
      type: "elements.ack",
      mutationId: commit.mutationId,
      revision: 1,
      saved: true,
    });
    await sleep(5);
    expect(await h.outboxStore.list(draftKey("alice", "1", "scene-1"))).toHaveLength(0);
    expect(h.sync.getSnapshot().scene).toBe("synced");
    expect(h.sync.getSnapshot().revision).toBe(1);
  });

  it("applies ack corrections and keeps forbidden entries with notice", async () => {
    const h = harness(HTTP_EMPTY);
    await startWithHttp(h, HTTP_EMPTY);
    await completeSync(h);
    h.scene.addElement(rect("a") as never);
    h.scene.commitChanges(["a"], "local");
    await sleep(5);
    const commit = h.conn().sent.find(
      (message) => message.type === "elements.commit",
    ) as { mutationId: string };
    h.conn().receiveCollab({
      type: "elements.ack",
      mutationId: commit.mutationId,
      revision: 2,
      saved: true,
      corrected: [rect("a", { version: 9, versionNonce: 9, x: 77 }) as NormalizedElement],
    });
    await sleep(5);
    expect(h.scene.getElement("a")).toMatchObject({ version: 9, x: 77 });

    h.scene.addElement(rect("b") as never);
    h.scene.commitChanges(["b"], "local");
    await sleep(5);
    const second = h.conn().sent.filter(
      (message) => message.type === "elements.commit",
    ).at(-1) as { mutationId: string };
    h.conn().receiveCollab({
      type: "elements.ack",
      mutationId: second.mutationId,
      revision: null,
      saved: false,
      reason: "forbidden",
    });
    await sleep(5);
    expect(h.sync.getSnapshot().scene).toBe("read-only");
    expect(
      await h.outboxStore.list(draftKey("alice", "1", "scene-1")),
    ).toHaveLength(1);
  });

  it("replays the same mutation ID after refresh-before-ack", async () => {
    const h = harness(HTTP_EMPTY);
    await startWithHttp(h, HTTP_EMPTY);
    await completeSync(h);
    h.scene.addElement(rect("a") as never);
    h.scene.commitChanges(["a"], "local");
    await sleep(5);
    const commit = h.conn().sent.find(
      (message) => message.type === "elements.commit",
    ) as { mutationId: string };
    // Simulate refresh: a new RoomSync over the same stores and scene.
    h.sync.stop();
    const sync2 = new RoomSync({
      roomId: "1",
      sceneId: "scene-1",
      userId: "alice",
      baseUrl: "ws://local",
      scene: h.scene,
      createConnection: (events) =>
        new FakeConnection(events) as unknown as PresenceConnection,
      getTicket: async () => "ticket",
      drafts: h.drafts,
      outboxStore: h.outboxStore,
    });
    syncs.push(sync2);
    await sync2.initializeWithHttpScene(HTTP_EMPTY);
    sync2.start();
    FakeConnection.instances.at(-1)!.goLive();
    await sleep(5);
    const secondConn = FakeConnection.instances.at(-1)!;
    const syncRequest = secondConn.sent.find(
      (message) => message.type === "scene.sync.request",
    ) as { requestId: string };
    secondConn.receiveCollab({
      type: "scene.sync.snapshot",
      requestId: syncRequest.requestId,
      revision: 0,
      elements: [],
      tombstones: {},
    });
    await sleep(10);
    const replayed = FakeConnection.instances
      .at(-1)!
      .sent.find((message) => message.type === "elements.commit") as {
      mutationId: string;
    };
    expect(replayed.mutationId).toBe(commit.mutationId);
  });
});

describe("RoomSync deferred drags and reconnects", () => {
  it("defers remote geometry for captured elements until commit", async () => {
    const h = harness(HTTP_EMPTY);
    await startWithHttp(h, HTTP_EMPTY);
    await completeSync(h);
    h.scene.addElement(rect("a", { x: 0 }) as never);
    h.scene.commitChanges(["a"], "local");
    const baseVersion = h.scene.getElement("a")?.version ?? 1;
    await sleep(5);
    h.conn().sent.length = 0;

    h.scene.beginCapture();
    h.scene.mutateElement("a", { x: 10 });
    // Remote committed geometry arrives mid-drag: held, not applied.
    h.conn().receiveCollab({
      type: "elements.committed",
      mutationId: "remote-1",
      connectionId: "c-bob",
      userId: "bob",
      revision: 5,
      elements: [rect("a", { version: baseVersion + 1, versionNonce: 50, x: 30 }) as NormalizedElement],
    });
    await sleep(5);
    expect(h.scene.getElement("a")?.x).toBe(10);
    const changes = h.scene.endCapture();
    expect(changes.length).toBeGreaterThan(0);
    h.scene.commitChanges(["a"], "local");
    await sleep(5);
    // Local commit used max(base, observed) + 1 and was enqueued.
    const commit = h.conn().sent.find(
      (message) => message.type === "elements.commit",
    ) as { elements: { id: string; version: number }[] };
    expect(commit.elements[0]?.version).toBe(baseVersion + 2);
    expect(h.scene.getElement("a")?.x).toBe(10);
  });

  it("applies deferred remotes when the gesture is cancelled", async () => {
    const h = harness(HTTP_EMPTY);
    await startWithHttp(h, HTTP_EMPTY);
    await completeSync(h);
    h.scene.addElement(rect("a", { x: 0 }) as never);
    h.scene.commitChanges(["a"], "local");
    const baseVersion = h.scene.getElement("a")?.version ?? 1;
    h.scene.beginCapture();
    h.scene.mutateElement("a", { x: 10 });
    h.conn().receiveCollab({
      type: "elements.committed",
      mutationId: "remote-1",
      connectionId: "c-bob",
      userId: "bob",
      revision: 5,
      elements: [rect("a", { version: baseVersion + 1, versionNonce: 50, x: 30 }) as NormalizedElement],
    });
    await sleep(5);
    h.scene.endCapture();
    await sleep(10);
    expect(h.scene.getElement("a")?.x).toBe(30);
  });

  it("survives a long outage during a drag and converges on reconnect", async () => {
    const h = harness(HTTP_EMPTY);
    await startWithHttp(h, HTTP_EMPTY);
    h.scene.addElement(rect("shared", { x: 0 }) as never);
    h.scene.addElement(rect("gone", { x: 0 }) as never);
    h.scene.commitChanges(["shared", "gone"], "local");
    // Acknowledge the setup commit so only the drag edit stays pending.
    await sleep(5);
    const setupCommit = h.conn().sent.find(
      (message) => message.type === "elements.commit",
    ) as { mutationId: string };
    h.conn().receiveCollab({
      type: "elements.ack",
      mutationId: setupCommit.mutationId,
      revision: 2,
      saved: true,
    });
    await sleep(5);
    const sharedBase = h.scene.getElement("shared")!;
    const goneBase = h.scene.getElement("gone")!;
    h.conn().sent.length = 0;

    // The drag starts, then the network drops for a long outage.
    h.scene.beginCapture();
    h.scene.mutateElement("shared", { x: 10 });
    h.conn().drop();
    // The gesture still commits locally into the durable outbox.
    const changes = h.scene.endCapture();
    expect(changes.length).toBeGreaterThan(0);
    h.scene.commitChanges(["shared"], "local");
    await sleep(5);
    expect(
      h.conn().sent.filter((message) => message.type === "elements.commit"),
    ).toHaveLength(0);
    expect(
      await h.outboxStore.list(draftKey("alice", "1", "scene-1")),
    ).toHaveLength(1);
    expect(h.sync.getSnapshot().scene).toBe("offline");

    // Meanwhile B changes the same element (newer), adds one, deletes one.
    // On reconnect the snapshot carries all three outcomes.
    h.conn().goLive();
    await sleep(5);
    const requestId = (
      h.conn().sent.find((message) => message.type === "scene.sync.request") as {
        requestId: string;
      }
    ).requestId;
    h.conn().receiveCollab({
      type: "scene.sync.snapshot",
      requestId,
      revision: 9,
      elements: [
        rect("shared", {
          version: (sharedBase.version ?? 1) + 2,
          versionNonce: 70,
          x: 99,
        }) as NormalizedElement,
        rect("added", { version: 2, versionNonce: 2 }) as NormalizedElement,
        rect("gone", {
          version: (goneBase.version ?? 1) + 1,
          versionNonce: 71,
          isDeleted: true,
        }) as NormalizedElement,
      ],
      tombstones: {},
    });
    await sleep(10);
    // Overlapping edit converged to the newer remote; disjoint add applied;
    // deletion stands; the covered local entry completed without resurrection.
    expect(h.scene.getElement("shared")?.x).toBe(99);
    expect(h.scene.getElement("added")).toBeDefined();
    expect(h.scene.getElement("gone")?.isDeleted).toBe(true);
    expect(
      await h.outboxStore.list(draftKey("alice", "1", "scene-1")),
    ).toHaveLength(0);
    expect(h.sync.getSnapshot().scene).toBe("synced");
  });

  it("buffers deltas that arrive during snapshot assembly", async () => {
    const h = harness(HTTP_EMPTY);
    await startWithHttp(h, HTTP_EMPTY);
    const requestId = (
      h.conn().sent.find((message) => message.type === "scene.sync.request") as {
        requestId: string;
      }
    ).requestId;
    // A delta newer than the upcoming snapshot arrives first.
    h.conn().receiveCollab({
      type: "elements.committed",
      mutationId: "early",
      connectionId: "c-bob",
      userId: "bob",
      revision: 6,
      elements: [rect("fast", { version: 2, versionNonce: 2 }) as NormalizedElement],
    });
    await sleep(5);
    expect(h.scene.getElement("fast")).toBeUndefined();
    h.conn().receiveCollab({
      type: "scene.sync.snapshot",
      requestId,
      revision: 5,
      elements: [],
      tombstones: {},
    });
    await sleep(5);
    expect(h.scene.getElement("fast")).toBeDefined();
    expect(h.sync.getSnapshot().revision).toBe(6);
  });
});

describe("RoomSync tombstones", () => {
  it("unions snapshot tombstones and rejects stale live replays", async () => {
    const h = harness(HTTP_EMPTY);
    await startWithHttp(h, HTTP_EMPTY);
    const requestId = (
      h.conn().sent.find((message) => message.type === "scene.sync.request") as {
        requestId: string;
      }
    ).requestId;
    h.conn().receiveCollab({
      type: "scene.sync.snapshot",
      requestId,
      revision: 3,
      elements: [],
      tombstones: {
        gone: { version: 4, versionNonce: 4, deletedAt: "2026-10-01T00:00:00.000Z" },
      },
    });
    await sleep(5);
    // A stale offline draft replaying the live body must not resurrect it.
    h.conn().receiveCollab({
      type: "elements.committed",
      mutationId: "stale",
      connectionId: "c-bob",
      userId: "bob",
      revision: 4,
      elements: [rect("gone", { version: 2, versionNonce: 2 }) as NormalizedElement],
    });
    await sleep(5);
    expect(h.scene.getElement("gone")).toBeUndefined();
    await h.sync.flushDraft();
    const draft = await h.drafts.load(draftKey("alice", "1", "scene-1"));
    expect(draft?.tombstones["gone"]).toMatchObject({ version: 4 });
  });
});

describe("RoomSync image files", () => {
  function image(id: string, fileId = "file-1") {
    return {
      id,
      type: "image",
      x: 0,
      y: 0,
      fileId,
      version: 2,
      versionNonce: 2,
    };
  }

  interface FakeFiles {
    uploaded: unknown[][];
    downloaded: unknown[][];
    seeded: string[][];
    upload: (elements: readonly unknown[]) => Promise<void>;
    download: (elements: readonly unknown[]) => Promise<void>;
    seedKnown: (fileIds: readonly string[]) => void;
  }

  function filesHarness(): ReturnType<typeof harness> & { files: FakeFiles } {
    const files: FakeFiles = {
      uploaded: [],
      downloaded: [],
      seeded: [],
      upload: async (elements) => {
        files.uploaded.push([...elements]);
      },
      download: async (elements) => {
        files.downloaded.push([...elements]);
      },
      seedKnown: (fileIds) => {
        files.seeded.push([...fileIds]);
      },
    };
    const h = harness(HTTP_EMPTY, 1000, files as never);
    return { ...h, files };
  }

  it("seeds known files, uploads before commit, and downloads remotes", async () => {
    const h = filesHarness();
    await startWithHttp(h, { ...HTTP_EMPTY, knownFileIds: ["file-0"] });
    expect(h.files.seeded).toEqual([["file-0"]]);
    await completeSync(h);

    h.scene.addElement(image("img") as never);
    h.scene.commitChanges(["img"], "local");
    await sleep(5);
    expect(h.files.uploaded).toHaveLength(1);
    const commit = h.conn().sent.find(
      (message) => message.type === "elements.commit",
    ) as { mutationId: string };
    expect(commit).toBeDefined();

    h.conn().receiveCollab({
      type: "elements.committed",
      mutationId: "remote-img",
      connectionId: "c-bob",
      userId: "bob",
      revision: 2,
      elements: [image("img2", "file-2") as never],
    });
    await sleep(5);
    expect(h.files.downloaded).toHaveLength(1);

    h.conn().receiveCollab({
      type: "elements.ack",
      mutationId: commit.mutationId,
      revision: 1,
      saved: true,
    });
    await sleep(5);
    expect(h.sync.getSnapshot().scene).toBe("synced");
  });

  it("retries blocked entries after uploading missing files", async () => {
    const h = filesHarness();
    await startWithHttp(h, HTTP_EMPTY);
    await completeSync(h);
    h.scene.addElement(image("img") as never);
    h.scene.commitChanges(["img"], "local");
    await sleep(5);
    const commit = h.conn().sent.find(
      (message) => message.type === "elements.commit",
    ) as { mutationId: string };
    const sendsBefore = h.conn().sent.filter(
      (message) => message.type === "elements.commit",
    ).length;
    h.conn().receiveCollab({
      type: "elements.ack",
      mutationId: commit.mutationId,
      revision: null,
      saved: false,
      missingFiles: ["file-1"],
    });
    await sleep(10);
    // Upload retried, entry unblocked, same mutation replayed.
    expect(h.files.uploaded.length).toBeGreaterThanOrEqual(2);
    const replays = h.conn().sent.filter(
      (message) =>
        message.type === "elements.commit" &&
        (message as { mutationId: string }).mutationId === commit.mutationId,
    );
    expect(replays.length).toBeGreaterThan(sendsBefore - 1);
    expect(
      await h.outboxStore.list(draftKey("alice", "1", "scene-1")),
    ).toHaveLength(1);
  });
});

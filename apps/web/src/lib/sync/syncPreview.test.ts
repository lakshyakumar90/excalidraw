import { afterEach, describe, expect, it } from "vitest";
import { Scene } from "@repo/engine";
import type {
  NormalizedElement,
  PreviewWireElement,
  ServerToClientCollabMessage,
} from "@repo/common";
import { validateSyncElement } from "@repo/common";
import type { PresenceConnection } from "@/lib/presence/presenceSocket";
import type { PresenceSocketEvents } from "@/lib/presence/presenceSocket";
import {
  createMemoryDraftStore,
  createMemoryOutboxStore,
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
}

const syncs: RoomSync[] = [];
afterEach(() => {
  for (const sync of syncs.splice(0)) sync.stop();
  FakeConnection.reset();
});

const HTTP_EMPTY: HttpRoomScene = { elements: [], tombstones: {}, revision: 0 };

async function started() {
  const scene = new Scene();
  const sync = new RoomSync({
    roomId: "1",
    sceneId: "scene-1",
    userId: "alice",
    baseUrl: "ws://local",
    scene,
    createConnection: (events) =>
      new FakeConnection(events) as unknown as PresenceConnection,
    getTicket: async () => "ticket",
    drafts: createMemoryDraftStore(),
    outboxStore: createMemoryOutboxStore(),
  });
  syncs.push(sync);
  await sync.initializeWithHttpScene(HTTP_EMPTY);
  sync.start();
  const conn = FakeConnection.instances.at(-1)!;
  conn.goLive();
  await sleep(5);
  const requestId = (
    conn.sent.find((message) => message.type === "scene.sync.request") as {
      requestId: string;
    }
  ).requestId;
  conn.events.onCollabMessage({
    type: "scene.sync.snapshot",
    requestId,
    revision: 0,
    elements: [],
    tombstones: {},
  });
  await sleep(5);
  return { sync, scene, conn };
}

function preview(
  gestureId: string,
  seq: number,
  base: Record<string, { version: number; versionNonce: number }> = {},
): Extract<ServerToClientCollabMessage, { type: "elements.preview" }> {
  return {
    type: "elements.preview",
    connectionId: "c-bob",
    userId: "bob",
    gestureId,
    seq,
    base,
    elements: [{ id: "a", x: 10, y: 20, width: 30, height: 40 }] as PreviewWireElement[],
  };
}

describe("RoomSync remote previews", () => {
  it("renders the latest frame and ignores late sequences", async () => {
    const { sync, conn } = await started();
    conn.events.onCollabMessage(preview("g1", 1));
    conn.events.onCollabMessage(preview("g1", 3));
    conn.events.onCollabMessage(preview("g1", 2));
    conn.events.onCollabMessage(preview("g1", 3));
    const entries = sync.previews.getPreviews();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.seq).toBe(3);
  });

  it("ignores frames based on superseded commits", async () => {
    const { sync, scene, conn } = await started();
    scene.addElement(rect("a", { version: 9, versionNonce: 9 }));
    conn.events.onCollabMessage(preview("g1", 1, { a: { version: 2, versionNonce: 2 } }));
    expect(sync.previews.getPreviews()).toHaveLength(0);
    conn.events.onCollabMessage(preview("g1", 2, { a: { version: 9, versionNonce: 9 } }));
    expect(sync.previews.getPreviews()).toHaveLength(1);
  });

  it("hides previews for the locally active gesture", async () => {
    const { sync, scene, conn } = await started();
    scene.addElement(rect("a", { version: 2, versionNonce: 2 }));
    scene.beginCapture();
    scene.mutateElement("a", { x: 5 });
    conn.events.onCollabMessage(preview("g1", 1, { a: { version: 2, versionNonce: 2 } }));
    expect(sync.previews.getPreviews()).toHaveLength(0);
    scene.endCapture();
  });

  it("clears gestures explicitly, on leave, and on reconnect", async () => {
    const { sync, conn } = await started();
    conn.events.onMessage({
      type: "presence.joined",
      participant: { connectionId: "c-bob", userId: "bob", displayName: "Bob" },
    });
    conn.events.onCollabMessage(preview("g1", 1));
    expect(sync.previews.getPreviews()).toHaveLength(1);
    conn.events.onCollabMessage({
      type: "elements.preview.end",
      connectionId: "c-bob",
      userId: "bob",
      gestureId: "g1",
    });
    expect(sync.previews.getPreviews()).toHaveLength(0);

    conn.events.onCollabMessage(preview("g2", 1));
    expect(sync.previews.getPreviews()).toHaveLength(1);
    conn.events.onMessage({ type: "presence.left", connectionId: "c-bob", userId: "bob" });
    expect(sync.previews.getPreviews()).toHaveLength(0);

    conn.events.onCollabMessage(preview("g3", 1));
    expect(sync.previews.getPreviews()).toHaveLength(1);
    conn.events.onStatus("reconnecting", null);
    conn.goLive();
    await sleep(5);
    expect(sync.previews.getPreviews()).toHaveLength(0);
  });
});

describe("RoomSync remote selections", () => {
  it("stores selections and drops them when the tab leaves", async () => {
    const { sync, conn } = await started();
    conn.events.onCollabMessage({
      type: "selection.update",
      connectionId: "c-bob",
      userId: "bob",
      elementIds: ["a", "b"],
    });
    await sleep(5);
    expect(sync.getSnapshot().selections).toMatchObject([
      { connectionId: "c-bob", userId: "bob", elementIds: ["a", "b"] },
    ]);
    conn.events.onCollabMessage({
      type: "selection.update",
      connectionId: "c-bob",
      userId: "bob",
      elementIds: [],
    });
    await sleep(5);
    expect(sync.getSnapshot().selections).toHaveLength(0);

    conn.events.onCollabMessage({
      type: "selection.update",
      connectionId: "c-bob",
      userId: "bob",
      elementIds: ["a"],
    });
    await sleep(5);
    conn.events.onMessage({ type: "presence.left", connectionId: "c-bob", userId: "bob" });
    await sleep(5);
    expect(sync.getSnapshot().selections).toHaveLength(0);
  });
});

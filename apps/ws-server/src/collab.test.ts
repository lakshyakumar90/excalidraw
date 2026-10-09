import assert from "node:assert/strict";
import { test } from "node:test";
import { WebSocket } from "ws";
import {
  COLLAB_WS_PROTOCOL,
  PRESENCE_WS_PROTOCOL,
  reconcileElements,
  type NormalizedElement,
  type TombstoneMap,
} from "@repo/common";
import {
  startPresenceServer,
  type PresenceServerHandle,
  type VerifiedTicket,
} from "./server.js";
import type { CommitResult, CollaborationService } from "@repo/backend-common";
import type { RoomRole } from "./roomStore.js";

function rect(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    version: 2,
    versionNonce: 2,
    ...overrides,
  };
}

interface Fixtures {
  tickets: Map<string, { userId: string; roomId: number }>;
  rooms: Map<number, { sceneId: string; members: Map<string, RoomRole> }>;
  names: Map<string, string>;
  ticket: (userId: string, roomId: number) => string;
  verifyTicket: (token: string) => VerifiedTicket;
  checkAccess: (roomId: number, userId: string) => Promise<boolean>;
  resolveRoom: (
    roomId: number,
    userId: string,
  ) => Promise<{ sceneId: string; role: RoomRole } | null>;
  getRole: (roomId: number, userId: string) => Promise<RoomRole | null>;
  resolveDisplayName: (userId: string) => Promise<string>;
}

function createFixtures(): Fixtures {
  const tickets = new Map<string, { userId: string; roomId: number }>();
  const rooms = new Map<
    number,
    { sceneId: string; members: Map<string, RoomRole> }
  >();
  const names = new Map<string, string>([
    ["alice", "Alice"],
    ["bob", "Bob"],
    ["carol", "Carol"],
  ]);
  let counter = 0;
  const fixtures: Fixtures = {
    tickets,
    rooms,
    names,
    ticket: (userId, roomId) => {
      const token = `collab-${userId}-${roomId}-${(counter += 1)}`;
      tickets.set(token, { userId, roomId });
      return token;
    },
    verifyTicket: (token) => {
      const claims = tickets.get(token);
      if (!claims) throw new Error("Invalid presence ticket.");
      return { ...claims, ticketId: `id-${token}` };
    },
    checkAccess: async (roomId, userId) =>
      fixtures.rooms.get(roomId)?.members.has(userId) ?? false,
    resolveRoom: async (roomId, userId) => {
      const room = fixtures.rooms.get(roomId);
      const role = room?.members.get(userId);
      if (!room || !role) return null;
      return { sceneId: room.sceneId, role };
    },
    getRole: async (roomId, userId) =>
      fixtures.rooms.get(roomId)?.members.get(userId) ?? null,
    resolveDisplayName: async (userId) => names.get(userId) ?? "Someone",
  };
  return fixtures;
}

function addRoom(
  fixtures: Fixtures,
  roomId: number,
  sceneId: string,
  members: [string, RoomRole][],
) {
  fixtures.rooms.set(roomId, {
    sceneId,
    members: new Map(members),
  });
}

interface FakeScene {
  elements: NormalizedElement[];
  tombstones: TombstoneMap;
  revision: number;
}

function createFakeService() {
  const scenes = new Map<string, FakeScene>();
  const seen = new Map<string, CommitResult>();
  return {
    scenes,
    applyCommit: async (input: {
      sceneId: string;
      userId: string;
      role: RoomRole;
      elements: unknown;
      mutationId: string;
    }): Promise<CommitResult> => {
      if (input.role !== "owner" && input.role !== "editor") {
        return {
          saved: false,
          revision: null,
          winners: [],
          corrected: [],
          reason: "forbidden",
        };
      }
      const cached = seen.get(input.mutationId);
      if (cached) return { ...cached, replayed: true };
      const state = scenes.get(input.sceneId) ?? {
        elements: [],
        tombstones: {},
        revision: 0,
      };
      const incoming = input.elements as NormalizedElement[];
      const merged = reconcileElements(
        state.elements,
        incoming,
        state.tombstones,
      );
      const tombstones: TombstoneMap = { ...state.tombstones };
      for (const [id, update] of Object.entries(merged.tombstoneUpdates)) {
        if (update === null) delete tombstones[id];
        else tombstones[id] = update;
      }
      const revision = state.revision + 1;
      scenes.set(input.sceneId, {
        elements: merged.merged,
        tombstones,
        revision,
      });
      const sent = new Map(incoming.map((element) => [element.id, element]));
      const storedById = new Map(
        merged.merged.map((element) => [element.id, element]),
      );
      const winners: NormalizedElement[] = [];
      const corrected: NormalizedElement[] = [];
      for (const id of sent.keys()) {
        const authoritative = storedById.get(id);
        if (!authoritative) continue;
        winners.push(authoritative);
        if (JSON.stringify(authoritative) !== JSON.stringify(sent.get(id))) {
          corrected.push(authoritative);
        }
      }
      const result = {
        saved: true,
        revision,
        winners,
        corrected,
        replayed: false,
      };
      seen.set(input.mutationId, result);
      return result;
    },
    readSyncScene: async (sceneId: string) => {
      const state = scenes.get(sceneId);
      if (!state) return null;
      return {
        elements: state.elements,
        tombstones: state.tombstones,
        revision: state.revision,
        data: {
          elements: state.elements,
          sync: { revision: state.revision, tombstones: state.tombstones },
        },
      };
    },
  };
}

interface TestClient {
  ws: WebSocket;
  messages: unknown[];
}

async function join(
  handle: PresenceServerHandle,
  roomId: number,
  ticket: string,
  protocol: string = COLLAB_WS_PROTOCOL,
): Promise<TestClient> {
  const ws = new WebSocket(`${handle.url}/room/${roomId}`, [
    protocol,
    `auth.${ticket}`,
  ]);
  const client: TestClient = { ws, messages: [] };
  ws.on("message", (data) => {
    try {
      client.messages.push(JSON.parse(data.toString()));
    } catch {
      // Non-JSON server frames fail the test on waitFor timeout.
    }
  });
  ws.on("error", () => {});
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("unexpected-response", (_request, response) =>
      reject(new Error(`upgrade rejected: ${response.statusCode}`)),
    );
  });
  return client;
}

async function waitFor(
  client: TestClient,
  predicate: (message: unknown) => boolean,
  timeoutMs = 3000,
): Promise<unknown> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = client.messages.find(predicate);
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for a collaboration message.");
}

const isType = (type: string) => (message: unknown) =>
  typeof message === "object" &&
  message !== null &&
  (message as { type?: unknown }).type === type;

async function startCollabServer(
  fixtures: Fixtures,
  service: ReturnType<typeof createFakeService>,
  options?: { maxPayloadBytes?: number },
) {
  return startPresenceServer({
    verifyTicket: fixtures.verifyTicket,
    checkAccess: fixtures.checkAccess,
    resolveDisplayName: fixtures.resolveDisplayName,
    resolveRoom: fixtures.resolveRoom,
    getRole: fixtures.getRole,
    service,
    maxPayloadBytes: options?.maxPayloadBytes,
  });
}

async function closeAll(handle: PresenceServerHandle, clients: TestClient[]) {
  for (const client of clients) {
    try {
      client.ws.removeAllListeners();
      client.ws.terminate();
    } catch {
      // Best effort teardown.
    }
  }
  await handle.close();
}

test("sync request returns the authoritative snapshot", async () => {
  const fixtures = createFixtures();
  addRoom(fixtures, 1, "scene-1", [["alice", "owner"]]);
  const service = createFakeService();
  service.scenes.set("scene-1", {
    elements: [rect("a", { version: 3, versionNonce: 4 }) as NormalizedElement],
    tombstones: {
      gone: {
        version: 2,
        versionNonce: 1,
        deletedAt: "2026-10-01T00:00:00.000Z",
      },
    },
    revision: 7,
  });
  const handle = await startCollabServer(fixtures, service);
  const clients: TestClient[] = [];
  try {
    const alice = await join(handle, 1, fixtures.ticket("alice", 1));
    clients.push(alice);
    assert.equal(alice.ws.protocol, COLLAB_WS_PROTOCOL);
    alice.ws.send(
      JSON.stringify({ type: "scene.sync.request", requestId: "req-1" }),
    );
    const snapshot = (await waitFor(alice, isType("scene.sync.snapshot"))) as {
      requestId: string;
      revision: number;
      elements: { id: string; version: number }[];
      tombstones: Record<string, unknown>;
    };
    assert.equal(snapshot.requestId, "req-1");
    assert.equal(snapshot.revision, 7);
    assert.deepEqual(
      snapshot.elements.map((element) => element.id),
      ["a"],
    );
    assert.ok("gone" in snapshot.tombstones);
  } finally {
    await closeAll(handle, clients);
  }
});

test("commits acknowledge the sender and fan out winners to others", async () => {
  const fixtures = createFixtures();
  addRoom(fixtures, 1, "scene-1", [
    ["alice", "owner"],
    ["bob", "editor"],
  ]);
  const service = createFakeService();
  const applyCommit = service.applyCommit;
  let releaseWrite!: () => void;
  const writeGate = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  service.applyCommit = async (input) => {
    await writeGate;
    return applyCommit(input);
  };
  const handle = await startCollabServer(fixtures, service);
  const clients: TestClient[] = [];
  try {
    const alice = await join(handle, 1, fixtures.ticket("alice", 1));
    const bob = await join(handle, 1, fixtures.ticket("bob", 1));
    const aliceTab2 = await join(handle, 1, fixtures.ticket("alice", 1));
    clients.push(alice, bob, aliceTab2);
    await waitFor(bob, isType("presence.snapshot"));

    alice.ws.send(
      JSON.stringify({
        type: "elements.commit",
        mutationId: "op-1",
        baseRevision: 0,
        elements: [rect("a", { version: 2, versionNonce: 9, x: 11 })],
      }),
    );
    const pending = await waitFor(bob, isType("elements.pending"));
    assert.equal((pending as { mutationId: string }).mutationId, "op-1");
    assert.equal(alice.messages.filter(isType("elements.ack")).length, 0);
    assert.equal(bob.messages.filter(isType("elements.committed")).length, 0);
    releaseWrite();
    const ack = (await waitFor(alice, isType("elements.ack"))) as {
      mutationId: string;
      revision: number;
      saved: boolean;
      corrected?: unknown[];
    };
    assert.equal(ack.mutationId, "op-1");
    assert.equal(ack.saved, true);
    assert.equal(ack.revision, 1);
    assert.ok(!("corrected" in ack) || (ack.corrected?.length ?? 0) === 0);

    const peerDelta = (await waitFor(bob, isType("elements.committed"))) as {
      mutationId: string;
      connectionId: string;
      userId: string;
      revision: number;
      elements: { id: string; x: number }[];
    };
    assert.equal(peerDelta.mutationId, "op-1");
    assert.equal(peerDelta.userId, "alice");
    assert.equal(peerDelta.revision, 1);
    assert.deepEqual(
      peerDelta.elements.map((element) => element.id),
      ["a"],
    );
    // The sender never receives its own delta, but the same user's other
    // tab does.
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(alice.messages.filter(isType("elements.committed")).length, 0);
    const secondTab = (await waitFor(
      aliceTab2,
      isType("elements.committed"),
    )) as {
      elements: { id: string }[];
    };
    assert.deepEqual(
      secondTab.elements.map((element) => element.id),
      ["a"],
    );

    // A replay is acknowledged but never rebroadcast.
    alice.ws.send(
      JSON.stringify({
        type: "elements.commit",
        mutationId: "op-1",
        baseRevision: 0,
        elements: [rect("a", { version: 2, versionNonce: 9, x: 11 })],
      }),
    );
    await waitFor(
      alice,
      (message) =>
        isType("elements.ack")(message) &&
        (message as { mutationId: string }).mutationId === "op-1",
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(bob.messages.filter(isType("elements.committed")).length, 1);
  } finally {
    await closeAll(handle, clients);
  }
});

test("viewer commits and role downgrades are rejected without fan-out", async () => {
  const fixtures = createFixtures();
  addRoom(fixtures, 1, "scene-1", [
    ["alice", "owner"],
    ["bob", "editor"],
    ["carol", "viewer"],
  ]);
  const service = createFakeService();
  const handle = await startCollabServer(fixtures, service);
  const clients: TestClient[] = [];
  try {
    const alice = await join(handle, 1, fixtures.ticket("alice", 1));
    const carol = await join(handle, 1, fixtures.ticket("carol", 1));
    clients.push(alice, carol);
    await waitFor(carol, isType("presence.snapshot"));

    carol.ws.send(
      JSON.stringify({
        type: "elements.commit",
        mutationId: "viewer-op",
        baseRevision: 0,
        elements: [rect("v")],
      }),
    );
    const forbidden = (await waitFor(carol, isType("elements.ack"))) as {
      saved: boolean;
      reason: string;
      revision: null;
    };
    assert.equal(forbidden.saved, false);
    assert.equal(forbidden.reason, "forbidden");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(alice.messages.filter(isType("elements.committed")).length, 0);

    // Downgrade takes effect on the live socket: the next commit fails.
    fixtures.rooms.get(1)!.members.set("carol", "viewer");
    const bob = await join(handle, 1, fixtures.ticket("bob", 1));
    clients.push(bob);
    fixtures.rooms.get(1)!.members.set("bob", "viewer");
    bob.ws.send(
      JSON.stringify({
        type: "elements.commit",
        mutationId: "downgraded-op",
        baseRevision: 0,
        elements: [rect("d")],
      }),
    );
    const downgraded = (await waitFor(bob, isType("elements.ack"))) as {
      saved: boolean;
      reason: string;
    };
    assert.equal(downgraded.saved, false);
    assert.equal(downgraded.reason, "forbidden");
  } finally {
    await closeAll(handle, clients);
  }
});

test("malformed commits are rejected without fan-out or acknowledgement", async () => {
  const fixtures = createFixtures();
  addRoom(fixtures, 1, "scene-1", [
    ["alice", "owner"],
    ["bob", "editor"],
  ]);
  const service = createFakeService();
  const handle = await startCollabServer(fixtures, service);
  const clients: TestClient[] = [];
  try {
    const alice = await join(handle, 1, fixtures.ticket("alice", 1));
    const bob = await join(handle, 1, fixtures.ticket("bob", 1));
    clients.push(alice, bob);
    await waitFor(bob, isType("presence.snapshot"));

    alice.ws.send(
      JSON.stringify({
        type: "elements.commit",
        mutationId: "bad-1",
        baseRevision: 0,
        elements: [{ ...rect("a"), version: 0 }],
      }),
    );
    await waitFor(alice, isType("error"));
    alice.ws.send(
      JSON.stringify({
        type: "elements.commit",
        mutationId: "bad-2",
        baseRevision: 0,
        elements: [rect("a"), rect("a")],
      }),
    );
    await waitFor(alice, isType("error"));
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(alice.messages.filter(isType("elements.ack")).length, 0);
    assert.equal(bob.messages.filter(isType("elements.committed")).length, 0);

    // The tab survives validation failures.
    alice.ws.send(
      JSON.stringify({
        type: "elements.commit",
        mutationId: "good-1",
        baseRevision: 0,
        elements: [rect("a")],
      }),
    );
    await waitFor(alice, isType("elements.ack"));
    await waitFor(bob, isType("elements.committed"));
  } finally {
    await closeAll(handle, clients);
  }
});

test("previews and selections fan out ephemerally with identity", async () => {
  const fixtures = createFixtures();
  addRoom(fixtures, 1, "scene-1", [
    ["alice", "owner"],
    ["bob", "editor"],
  ]);
  const service = createFakeService();
  const handle = await startCollabServer(fixtures, service);
  const clients: TestClient[] = [];
  try {
    const alice = await join(handle, 1, fixtures.ticket("alice", 1));
    const bob = await join(handle, 1, fixtures.ticket("bob", 1));
    clients.push(alice, bob);
    await waitFor(bob, isType("presence.snapshot"));

    alice.ws.send(
      JSON.stringify({
        type: "elements.preview",
        gestureId: "drag-1",
        seq: 1,
        base: {},
        elements: [{ id: "a", x: 10, y: 20, width: 30, height: 40 }],
      }),
    );
    const preview = (await waitFor(
      bob,
      (message) =>
        isType("elements.preview")(message) &&
        (message as { gestureId: string }).gestureId === "drag-1",
    )) as {
      connectionId: string;
      userId: string;
      seq: number;
      elements: { id: string }[];
    };
    assert.equal(preview.userId, "alice");
    assert.equal(preview.seq, 1);
    assert.deepEqual(
      preview.elements.map((element) => element.id),
      ["a"],
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(alice.messages.filter(isType("elements.preview")).length, 0);

    alice.ws.send(
      JSON.stringify({ type: "elements.preview.end", gestureId: "drag-1" }),
    );
    const ended = (await waitFor(bob, isType("elements.preview.end"))) as {
      gestureId: string;
      userId: string;
    };
    assert.equal(ended.gestureId, "drag-1");
    assert.equal(ended.userId, "alice");

    alice.ws.send(
      JSON.stringify({ type: "selection.update", elementIds: ["a", "b"] }),
    );
    const selection = (await waitFor(bob, isType("selection.update"))) as {
      userId: string;
      elementIds: string[];
    };
    assert.equal(selection.userId, "alice");
    assert.deepEqual(selection.elementIds, ["a", "b"]);
  } finally {
    await closeAll(handle, clients);
  }
});

test("commits stay isolated per room", async () => {
  const fixtures = createFixtures();
  addRoom(fixtures, 1, "scene-1", [["alice", "owner"]]);
  addRoom(fixtures, 2, "scene-2", [["carol", "owner"]]);
  const service = createFakeService();
  const handle = await startCollabServer(fixtures, service);
  const clients: TestClient[] = [];
  try {
    const alice = await join(handle, 1, fixtures.ticket("alice", 1));
    const carol = await join(handle, 2, fixtures.ticket("carol", 2));
    clients.push(alice, carol);
    await waitFor(carol, isType("presence.snapshot"));

    alice.ws.send(
      JSON.stringify({
        type: "elements.commit",
        mutationId: "room-1-op",
        baseRevision: 0,
        elements: [rect("a")],
      }),
    );
    await waitFor(alice, isType("elements.ack"));
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(carol.messages.filter(isType("elements.committed")).length, 0);
    assert.ok(
      !service.scenes.has("scene-2") ||
        service.scenes.get("scene-2")!.elements.length === 0,
    );
  } finally {
    await closeAll(handle, clients);
  }
});

test("large scenes arrive as snapshot metadata plus ordered chunks", async () => {
  const fixtures = createFixtures();
  addRoom(fixtures, 1, "scene-1", [["alice", "owner"]]);
  const service = createFakeService();
  const elements = Array.from({ length: 1200 }, (_, index) =>
    rect(`chunk-${index}`, {
      x: index,
      text: "x".repeat(200),
      type: "text",
      fontSize: 10,
      fontFamily: "Virgil",
      textAlign: "left",
      verticalAlign: "top",
    }),
  ) as NormalizedElement[];
  service.scenes.set("scene-1", { elements, tombstones: {}, revision: 3 });
  const handle = await startCollabServer(fixtures, service);
  const clients: TestClient[] = [];
  try {
    const alice = await join(handle, 1, fixtures.ticket("alice", 1));
    clients.push(alice);
    alice.ws.send(
      JSON.stringify({ type: "scene.sync.request", requestId: "big-1" }),
    );
    const snapshot = (await waitFor(alice, isType("scene.sync.snapshot"))) as {
      requestId: string;
      revision: number;
      elements: unknown[];
      chunks?: { count: number };
    };
    assert.equal(snapshot.requestId, "big-1");
    assert.equal(snapshot.revision, 3);
    assert.ok(snapshot.chunks && snapshot.chunks.count > 1);
    const count = snapshot.chunks!.count;
    const received: unknown[][] = [];
    for (let index = 0; index < count; index += 1) {
      const chunk = (await waitFor(
        alice,
        (message) =>
          isType("scene.sync.chunk")(message) &&
          (message as { index: number }).index === index,
      )) as { elements: unknown[]; count: number };
      assert.equal(chunk.count, count);
      received.push(chunk.elements);
    }
    assert.equal(
      received.flat().length,
      1200,
      "chunked snapshot reassembles every element",
    );
  } finally {
    await closeAll(handle, clients);
  }
});

test("presence-only connections cannot use collaboration messages", async () => {
  const fixtures = createFixtures();
  addRoom(fixtures, 1, "scene-1", [["alice", "owner"]]);
  const service = createFakeService();
  const handle = await startCollabServer(fixtures, service);
  const clients: TestClient[] = [];
  try {
    const alice = await join(
      handle,
      1,
      fixtures.ticket("alice", 1),
      PRESENCE_WS_PROTOCOL,
    );
    clients.push(alice);
    assert.equal(alice.ws.protocol, PRESENCE_WS_PROTOCOL);
    alice.ws.send(
      JSON.stringify({
        type: "elements.commit",
        mutationId: "legacy-op",
        baseRevision: 0,
        elements: [rect("a")],
      }),
    );
    await waitFor(alice, isType("error"));
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(alice.messages.filter(isType("elements.ack")).length, 0);

    // Presence still works on the legacy protocol.
    alice.ws.send(JSON.stringify({ type: "pointer.move", x: 1, y: 2 }));
    await new Promise((resolve) => setTimeout(resolve, 150));
  } finally {
    await closeAll(handle, clients);
  }
});

test("commit bursts beyond budget slow down instead of dropping", async () => {
  const fixtures = createFixtures();
  addRoom(fixtures, 1, "scene-1", [["alice", "owner"]]);
  const service = createFakeService();
  const handle = await startCollabServer(fixtures, service);
  const clients: TestClient[] = [];
  try {
    const alice = await join(handle, 1, fixtures.ticket("alice", 1));
    clients.push(alice);
    await waitFor(alice, isType("presence.snapshot"));
    for (let index = 0; index < 25; index += 1) {
      alice.ws.send(
        JSON.stringify({
          type: "elements.commit",
          mutationId: `burst-${index}`,
          baseRevision: 0,
          elements: [rect(`burst-${index}`)],
        }),
      );
    }
    const deadline = Date.now() + 5000;
    const count = (type: string) => alice.messages.filter(isType(type)).length;
    while (
      Date.now() < deadline &&
      count("elements.ack") + count("error") < 25
    ) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(count("elements.ack") + count("error"), 25);
    assert.ok(
      count("error") >= 1,
      "over-budget commits get an explicit slow-down, never silence",
    );
  } finally {
    await closeAll(handle, clients);
  }
});

test("oversized frames are capped by the payload limit", async () => {
  const fixtures = createFixtures();
  addRoom(fixtures, 1, "scene-1", [["alice", "owner"]]);
  const service = createFakeService();
  const handle = await startCollabServer(fixtures, service, {
    maxPayloadBytes: 1024,
  });
  try {
    const alice = await join(handle, 1, fixtures.ticket("alice", 1));
    try {
      const code = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("oversized frame was accepted")),
          3000,
        );
        alice.ws.once("close", (closeCode) => {
          clearTimeout(timer);
          resolve(closeCode);
        });
        alice.ws.send(
          JSON.stringify({
            type: "elements.preview",
            gestureId: "big",
            seq: 0,
            base: {},
            elements: [{ id: "a", x: 0, y: 0, text: "x".repeat(4096) }],
          }),
        );
      });
      assert.equal(code, 1009);
    } finally {
      alice.ws.terminate();
    }
  } finally {
    await handle.close();
  }
});

test("Phase 19 viewer laser is ephemeral, isolated, and carries server identity", async () => {
  const fixtures = createFixtures();
  addRoom(fixtures, 1, "scene-1", [
    ["alice", "owner"],
    ["bob", "viewer"],
  ]);
  addRoom(fixtures, 2, "scene-2", [["carol", "owner"]]);
  const service = createFakeService();
  let writes = 0;
  const apply = service.applyCommit;
  service.applyCommit = async (input) => {
    writes++;
    return apply(input);
  };
  const handle = await startCollabServer(fixtures, service);
  const clients: TestClient[] = [];
  try {
    const alice = await join(handle, 1, fixtures.ticket("alice", 1)),
      bob = await join(handle, 1, fixtures.ticket("bob", 1)),
      carol = await join(handle, 2, fixtures.ticket("carol", 2));
    clients.push(alice, bob, carol);
    await waitFor(bob, isType("presence.snapshot"));
    bob.ws.send(
      JSON.stringify({
        type: "laser.move",
        gestureId: "laser",
        seq: 1,
        points: [{ x: 25, y: 50 }],
      }),
    );
    const message = (await waitFor(alice, isType("laser.move"))) as Record<
      string,
      unknown
    >;
    assert.equal(message.userId, "bob");
    assert.equal(typeof message.connectionId, "string");
    assert.equal(writes, 0);
    bob.ws.send(
      JSON.stringify({
        type: "laser.move",
        gestureId: "laser",
        seq: 2,
        points: [{ x: 25, y: 50 }],
        userId: "alice",
      }),
    );
    await waitFor(bob, isType("error"));
    assert.equal(bob.messages.filter(isType("laser.move")).length, 0);
    assert.equal(carol.messages.filter(isType("laser.move")).length, 0);
    assert.equal(writes, 0);
  } finally {
    await closeAll(handle, clients);
  }
});

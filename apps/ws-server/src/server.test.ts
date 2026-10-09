import assert from "node:assert/strict";
import { test } from "node:test";
import { WebSocket } from "ws";
import { PRESENCE_WS_PROTOCOL } from "@repo/common";
import {
  startPresenceServer,
  type PresenceServerHandle,
  type VerifiedTicket,
} from "./server.js";

interface Fixtures {
  tickets: Map<string, { userId: string; roomId: number }>;
  access: Set<string>;
  names: Map<string, string>;
  ticket: (userId: string, roomId: number) => string;
  verifyTicket: (token: string) => VerifiedTicket;
  checkAccess: (roomId: number, userId: string) => Promise<boolean>;
  resolveDisplayName: (userId: string) => Promise<string>;
}

function createFixtures(): Fixtures {
  const tickets = new Map<string, { userId: string; roomId: number }>();
  const access = new Set<string>();
  const names = new Map<string, string>([
    ["alice", "Alice"],
    ["bob", "Bob"],
  ]);
  let counter = 0;
  const fixtures: Fixtures = {
    tickets,
    access,
    names,
    ticket: (userId, roomId) => {
      const token = `ticket-${userId}-${roomId}-${(counter += 1)}`;
      tickets.set(token, { userId, roomId });
      return token;
    },
    verifyTicket: (token) => {
      const claims = tickets.get(token);
      if (!claims) throw new Error("Invalid presence ticket.");
      return { ...claims, ticketId: `id-${token}` };
    },
    checkAccess: async (roomId, userId) => access.has(`${roomId}:${userId}`),
    resolveDisplayName: async (userId) => names.get(userId) ?? "Someone",
  };
  return fixtures;
}

interface TestClient {
  ws: WebSocket;
  messages: unknown[];
  raw: string[];
}

async function join(
  handle: PresenceServerHandle,
  roomId: number,
  ticket: string,
  protocols: string[] = [PRESENCE_WS_PROTOCOL, `auth.${ticket}`],
): Promise<TestClient> {
  const ws = new WebSocket(`${handle.url}/room/${roomId}`, protocols);
  const client: TestClient = { ws, messages: [], raw: [] };
  ws.on("message", (data) => {
    const text = data.toString();
    client.raw.push(text);
    try {
      client.messages.push(JSON.parse(text));
    } catch {
      // Malformed server payloads are asserted via raw frames.
    }
  });
  ws.on("error", () => {
    // Rejections surface through "unexpected-response"; ignore the echo.
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("unexpected-response", (_request, response) =>
      reject(new Error(`upgrade rejected: ${response.statusCode}`)),
    );
  });
  return client;
}

function upgradeStatus(
  handle: PresenceServerHandle,
  path: string,
  protocols?: string[],
  origin?: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${handle.url}${path}`,
      protocols as string[],
      origin ? { origin } : undefined,
    );
    ws.on("error", () => {
      // Expected for rejected upgrades; status arrives separately.
    });
    ws.once("unexpected-response", (_request, response) => {
      resolve(response.statusCode ?? 0);
      ws.close();
    });
    ws.once("open", () => {
      ws.close();
      reject(new Error("upgrade unexpectedly succeeded"));
    });
  });
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
  throw new Error("Timed out waiting for a presence message.");
}

const isType = (type: string) => (message: unknown) =>
  typeof message === "object" &&
  message !== null &&
  (message as { type?: unknown }).type === type;

async function closeAll(
  handle: PresenceServerHandle,
  clients: TestClient[],
): Promise<void> {
  for (const client of clients) {
    try {
      client.ws.removeAllListeners();
      client.ws.terminate();
    } catch {
      // Termination is best effort during teardown.
    }
  }
  await handle.close();
}

test("join, pointer/viewport fan-out, and room isolation", async () => {
  const fixtures = createFixtures();
  fixtures.access.add("1:alice");
  fixtures.access.add("1:bob");
  fixtures.access.add("2:carol");
  const handle = await startPresenceServer(fixtures);
  const clients: TestClient[] = [];
  try {
    const alice = await join(handle, 1, fixtures.ticket("alice", 1));
    clients.push(alice);
    assert.equal(alice.ws.protocol, PRESENCE_WS_PROTOCOL);
    const firstSnapshot = (await waitFor(alice, isType("presence.snapshot"))) as {
      participants: { connectionId: string; userId: string; displayName: string }[];
    };
    assert.equal(firstSnapshot.participants.length, 1);
    assert.equal(firstSnapshot.participants[0]?.userId, "alice");
    assert.equal(firstSnapshot.participants[0]?.displayName, "Alice");
    const aliceConnectionId = firstSnapshot.participants[0]?.connectionId;
    assert.match(JSON.stringify(firstSnapshot), /^(?!.*email).*$/);

    const bob = await join(handle, 1, fixtures.ticket("bob", 1));
    clients.push(bob);
    const joined = (await waitFor(
      alice,
      (message) =>
        isType("presence.joined")(message) &&
        (message as { participant: { userId: string } }).participant.userId ===
          "bob",
    )) as { participant: { connectionId: string; displayName: string } };
    assert.equal(joined.participant.displayName, "Bob");
    await waitFor(
      bob,
      (message) =>
        isType("presence.snapshot")(message) &&
        (message as { participants: unknown[] }).participants.length === 2,
    );

    alice.ws.send(JSON.stringify({ type: "pointer.move", x: 10, y: 20 }));
    const relayed = (await waitFor(
      bob,
      (message) =>
        isType("pointer.move")(message) &&
        (message as { x: number }).x === 10,
    )) as Record<string, unknown>;
    // Fan-out carries presence fields only — never element data.
    assert.deepEqual(Object.keys(relayed).sort(), [
      "connectionId",
      "type",
      "userId",
      "x",
      "y",
    ]);
    assert.equal(relayed.connectionId, aliceConnectionId);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(
      alice.messages.filter(isType("pointer.move")).length,
      0,
      "senders must not receive their own pointer",
    );

    bob.ws.send(JSON.stringify({ type: "viewport.update", x: 5, y: 6, zoom: 2 }));
    const viewport = (await waitFor(alice, isType("viewport.update"))) as {
      x: number;
      y: number;
      zoom: number;
    };
    assert.deepEqual(
      [viewport.x, viewport.y, viewport.zoom],
      [5, 6, 2],
    );

    alice.ws.send(JSON.stringify({ type: "pointer.leave" }));
    await waitFor(
      bob,
      (message) =>
        isType("pointer.leave")(message) &&
        (message as { connectionId: string }).connectionId ===
          aliceConnectionId,
    );

    // Room 2 is isolated from room 1 traffic.
    const carol = await join(handle, 2, fixtures.ticket("carol", 2));
    clients.push(carol);
    const carolSnapshot = (await waitFor(carol, isType("presence.snapshot"))) as {
      participants: unknown[];
    };
    assert.equal(carolSnapshot.participants.length, 1);
    alice.ws.send(JSON.stringify({ type: "pointer.move", x: 99, y: 99 }));
    await waitFor(bob, isType("pointer.move"));
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(
      carol.messages.filter(isType("pointer.move")).length,
      0,
      "rooms must not leak pointer traffic",
    );
  } finally {
    await closeAll(handle, clients);
  }
});

test("invalid, wrong-room, and nonmember upgrades are rejected", async () => {
  const fixtures = createFixtures();
  fixtures.access.add("1:alice");
  const handle = await startPresenceServer(fixtures);
  try {
    assert.equal(
      await upgradeStatus(handle, "/room/1", [PRESENCE_WS_PROTOCOL, "auth.nope"]),
      401,
      "unknown tickets are rejected",
    );
    assert.equal(
      await upgradeStatus(handle, "/room/1", [PRESENCE_WS_PROTOCOL]),
      401,
      "missing tickets are rejected",
    );
    assert.equal(
      await upgradeStatus(handle, "/room/1"),
      401,
      "missing protocol entries are rejected",
    );
    const wrongRoom = fixtures.ticket("alice", 2);
    fixtures.access.add("2:alice");
    assert.equal(
      await upgradeStatus(handle, "/room/1", [
        PRESENCE_WS_PROTOCOL,
        `auth.${wrongRoom}`,
      ]),
      403,
      "tickets are room-scoped",
    );
    const outsider = fixtures.ticket("mallory", 1);
    assert.equal(
      await upgradeStatus(handle, "/room/1", [
        PRESENCE_WS_PROTOCOL,
        `auth.${outsider}`,
      ]),
      403,
      "nonmembers are rejected",
    );
    assert.equal(
      await upgradeStatus(handle, "/nope", [
        PRESENCE_WS_PROTOCOL,
        `auth.${fixtures.ticket("alice", 1)}`,
      ]),
      404,
    );
  } finally {
    await handle.close();
  }
});

test("unlisted origins are rejected when an allowlist is configured", async () => {
  const fixtures = createFixtures();
  fixtures.access.add("1:alice");
  const handle = await startPresenceServer({
    ...fixtures,
    allowedOrigins: ["https://app.example"],
  });
  try {
    assert.equal(
      await upgradeStatus(
        handle,
        "/room/1",
        [PRESENCE_WS_PROTOCOL, `auth.${fixtures.ticket("alice", 1)}`],
        "https://evil.example",
      ),
      403,
    );
    const allowed = await join(handle, 1, fixtures.ticket("alice", 1));
    try {
      await waitFor(allowed, isType("presence.snapshot"));
    } finally {
      allowed.ws.terminate();
    }
  } finally {
    await handle.close();
  }
});

test("two tabs share a user but keep distinct connections", async () => {
  const fixtures = createFixtures();
  fixtures.access.add("1:alice");
  fixtures.access.add("1:bob");
  const handle = await startPresenceServer(fixtures);
  const clients: TestClient[] = [];
  try {
    const first = await join(handle, 1, fixtures.ticket("alice", 1));
    const second = await join(handle, 1, fixtures.ticket("alice", 1));
    const bob = await join(handle, 1, fixtures.ticket("bob", 1));
    clients.push(first, second, bob);
    const snapshot = (await waitFor(
      bob,
      (message) =>
        isType("presence.snapshot")(message) &&
        (message as { participants: unknown[] }).participants.length === 3,
    )) as {
      participants: { connectionId: string; userId: string }[];
    };
    const aliceTabs = snapshot.participants.filter(
      (participant) => participant.userId === "alice",
    );
    assert.equal(aliceTabs.length, 2);
    assert.notEqual(aliceTabs[0]?.connectionId, aliceTabs[1]?.connectionId);

    // Closing one tab removes only that tab.
    const closingId = aliceTabs[0]?.connectionId;
    first.ws.close();
    const left = (await waitFor(
      bob,
      (message) =>
        isType("presence.left")(message) &&
        (message as { connectionId: string }).connectionId === closingId,
    )) as { connectionId: string; userId: string };
    assert.equal(left.userId, "alice");
    // The surviving tab keeps publishing.
    second.ws.send(JSON.stringify({ type: "pointer.move", x: 7, y: 8 }));
    const survivor = (await waitFor(bob, isType("pointer.move"))) as {
      connectionId: string;
    };
    assert.notEqual(survivor.connectionId, closingId);

    // Reconnecting with a fresh ticket restores the full snapshot.
    const fresh = await join(handle, 1, fixtures.ticket("alice", 1));
    clients.push(fresh);
    const resnapshot = (await waitFor(fresh, isType("presence.snapshot"))) as {
      participants: unknown[];
    };
    assert.equal(resnapshot.participants.length, 3);
  } finally {
    await closeAll(handle, clients);
  }
});

test("revoked members lose their sockets promptly", async () => {
  const fixtures = createFixtures();
  fixtures.access.add("1:alice");
  fixtures.access.add("1:bob");
  const handle = await startPresenceServer({
    ...fixtures,
    membershipRecheckMs: 30,
  });
  const clients: TestClient[] = [];
  try {
    const alice = await join(handle, 1, fixtures.ticket("alice", 1));
    const bob = await join(handle, 1, fixtures.ticket("bob", 1));
    clients.push(alice, bob);
    await waitFor(bob, isType("presence.snapshot"));
    fixtures.access.delete("1:bob");
    const code = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("revoked socket stayed open")),
        3000,
      );
      bob.ws.once("close", (closeCode) => {
        clearTimeout(timer);
        resolve(closeCode);
      });
    });
    assert.equal(code, 4403);
    await waitFor(
      alice,
      (message) =>
        isType("presence.left")(message) &&
        (message as { userId: string }).userId === "bob",
    );
  } finally {
    await closeAll(handle, clients);
  }
});

test("malformed and smuggled payloads are rejected without dropping the tab", async () => {
  const fixtures = createFixtures();
  fixtures.access.add("1:alice");
  fixtures.access.add("1:bob");
  const handle = await startPresenceServer(fixtures);
  const clients: TestClient[] = [];
  try {
    const alice = await join(handle, 1, fixtures.ticket("alice", 1));
    const bob = await join(handle, 1, fixtures.ticket("bob", 1));
    clients.push(alice, bob);
    await waitFor(bob, isType("presence.snapshot"));

    alice.ws.send("not-json{{");
    await waitFor(alice, isType("error"));

    alice.ws.send(
      JSON.stringify({
        type: "pointer.move",
        x: 1,
        y: 2,
        elements: [{ id: "smuggled" }],
      }),
    );
    await waitFor(alice, isType("error"));
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(
      bob.messages.filter(isType("pointer.move")).length,
      0,
      "invalid payloads must not fan out",
    );

    // The tab survives validation failures.
    alice.ws.send(JSON.stringify({ type: "pointer.move", x: 3, y: 4 }));
    await waitFor(bob, isType("pointer.move"));
  } finally {
    await closeAll(handle, clients);
  }
});

test("oversized frames are capped by the payload limit", async () => {
  const fixtures = createFixtures();
  fixtures.access.add("1:alice");
  const handle = await startPresenceServer({ ...fixtures, maxPayloadBytes: 256 });
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
        alice.ws.send(JSON.stringify({ type: "pointer.move", x: 1, y: 2, padding: "x".repeat(2048) }));
      });
      assert.equal(code, 1009);
    } finally {
      alice.ws.terminate();
    }
  } finally {
    await handle.close();
  }
});

test("healthy sockets survive frequent heartbeats", async () => {
  const fixtures = createFixtures();
  fixtures.access.add("1:alice");
  fixtures.access.add("1:bob");
  const handle = await startPresenceServer({
    ...fixtures,
    heartbeatIntervalMs: 50,
  });
  const clients: TestClient[] = [];
  try {
    const alice = await join(handle, 1, fixtures.ticket("alice", 1));
    const bob = await join(handle, 1, fixtures.ticket("bob", 1));
    clients.push(alice, bob);
    await waitFor(bob, isType("presence.snapshot"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(alice.ws.readyState, WebSocket.OPEN);
    assert.equal(bob.ws.readyState, WebSocket.OPEN);
    alice.ws.send(JSON.stringify({ type: "pointer.move", x: 1, y: 1 }));
    await waitFor(bob, isType("pointer.move"));
  } finally {
    await closeAll(handle, clients);
  }
});

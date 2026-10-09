import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addConnection,
  checkRateLimit,
  createRoomMap,
  removeConnection,
  sendToRoom,
  snapshotParticipants,
  sweepHeartbeats,
  type PresenceSocket,
  type RoomConnection,
} from "./roomStore.js";

function fakeSocket(overrides?: Partial<PresenceSocket>): PresenceSocket & {
  sent: string[];
  pings: number;
  terminated: boolean;
} {
  const socket = {
    readyState: 1,
    bufferedAmount: 0,
    sent: [] as string[],
    pings: 0,
    terminated: false,
    send(data: string) {
      socket.sent.push(data);
    },
    ping() {
      socket.pings += 1;
    },
    terminate() {
      socket.terminated = true;
    },
    close() {},
    ...overrides,
  };
  return socket;
}

function connection(
  roomId: number,
  connectionId: string,
  userId: string,
  ws?: PresenceSocket,
): RoomConnection {
  return {
    connectionId,
    roomId,
    sceneId: `scene-${roomId}`,
    userId,
    displayName: userId,
    role: "editor",
    collab: true,
    ws: ws ?? fakeSocket(),
    isAlive: true,
    selection: [],
    messageTimestamps: [],
    commitTimestamps: [],
  };
}

test("tabs are tracked per connection and rooms vanish when empty", () => {
  const rooms = createRoomMap();
  const first = connection(1, "c1", "alice");
  const second = connection(1, "c2", "alice");
  addConnection(rooms, first);
  addConnection(rooms, second);
  // Two tabs of one user keep distinct connection IDs.
  assert.deepEqual(
    snapshotParticipants(rooms, 1).map((participant) => participant.connectionId),
    ["c1", "c2"],
  );
  const removed = removeConnection(rooms, 1, "c1");
  assert.equal(removed?.connectionId, "c1");
  assert.equal(snapshotParticipants(rooms, 1).length, 1);
  assert.equal(removeConnection(rooms, 1, "missing"), null);
  removeConnection(rooms, 1, "c2");
  assert.equal(rooms.has(1), false);
});

test("snapshots carry only presence fields", () => {
  const rooms = createRoomMap();
  const tab = connection(3, "c1", "alice");
  tab.pointer = { x: 1, y: 2 };
  tab.viewport = { x: 3, y: 4, zoom: 1.5 };
  addConnection(rooms, tab);
  const snapshot = snapshotParticipants(rooms, 3);
  assert.deepEqual(snapshot, [
    {
      connectionId: "c1",
      userId: "alice",
      displayName: "alice",
      pointer: { x: 1, y: 2 },
      viewport: { x: 3, y: 4, zoom: 1.5 },
    },
  ]);
  assert.match(JSON.stringify(snapshot), /^(?!.*email).*$/);
});

test("fan-out skips the sender, closed sockets, and slow sockets for deltas", () => {
  const rooms = createRoomMap();
  const sender = connection(1, "sender", "alice");
  const peer = connection(1, "peer", "bob");
  const slow = connection(1, "slow", "carol", fakeSocket({ bufferedAmount: 1_000_000 }));
  const closed = connection(1, "closed", "dan", fakeSocket({ readyState: 3 }));
  for (const tab of [sender, peer, slow, closed]) addConnection(rooms, tab);

  sendToRoom(rooms, 1, { type: "pointer.move", connectionId: "sender", userId: "alice", x: 1, y: 2 }, { exceptConnectionId: "sender" });
  assert.equal((peer.ws as ReturnType<typeof fakeSocket>).sent.length, 1);
  assert.equal((slow.ws as ReturnType<typeof fakeSocket>).sent.length, 0);
  assert.equal((closed.ws as ReturnType<typeof fakeSocket>).sent.length, 0);

  // Membership and durable collaboration events are not ephemeral:
  // slow sockets still get them.
  sendToRoom(rooms, 1, { type: "presence.left", connectionId: "sender", userId: "alice" });
  assert.equal((slow.ws as ReturnType<typeof fakeSocket>).sent.length, 1);
  sendToRoom(rooms, 1, {
    type: "elements.committed",
    mutationId: "m1",
    connectionId: "sender",
    userId: "alice",
    revision: 2,
    elements: [],
  });
  assert.equal((slow.ws as ReturnType<typeof fakeSocket>).sent.length, 2);

  // Previews and selections are ephemeral like pointer deltas.
  sendToRoom(rooms, 1, {
    type: "elements.preview",
    connectionId: "sender",
    userId: "alice",
    gestureId: "g1",
    seq: 1,
    elements: [],
  });
  assert.equal((slow.ws as ReturnType<typeof fakeSocket>).sent.length, 2);
  assert.equal((peer.ws as ReturnType<typeof fakeSocket>).sent.length, 4);
});

test("rate limiter allows bursts within budget and rejects excess", () => {
  let timestamps: number[] = [];
  const now = 1_000_000;
  for (let index = 0; index < 60; index += 1) {
    const checked = checkRateLimit(timestamps, now + index);
    assert.equal(checked.allowed, true);
    timestamps = checked.timestamps;
  }
  const rejected = checkRateLimit(timestamps, now + 60);
  assert.equal(rejected.allowed, false);
  timestamps = rejected.timestamps;
  // After the window passes, publishing resumes.
  const resumed = checkRateLimit(timestamps, now + 1_001);
  assert.equal(resumed.allowed, true);
});

test("heartbeat sweep pings the living and terminates the missed", () => {
  const rooms = createRoomMap();
  const live = connection(1, "live", "alice");
  const missed = connection(1, "missed", "bob");
  missed.isAlive = false;
  addConnection(rooms, live);
  addConnection(rooms, missed);
  const departed = sweepHeartbeats(rooms);
  assert.equal((live.ws as ReturnType<typeof fakeSocket>).pings, 1);
  assert.equal(live.isAlive, false);
  assert.equal((missed.ws as ReturnType<typeof fakeSocket>).terminated, true);
  assert.deepEqual(
    departed.map((entry) => entry.connection.connectionId),
    ["missed"],
  );
  // Only the terminated tab is removed; the room survives.
  assert.deepEqual(
    snapshotParticipants(rooms, 1).map((participant) => participant.connectionId),
    ["live"],
  );
});

import {
  WS_RATE_LIMIT_MAX_MESSAGES,
  WS_RATE_LIMIT_WINDOW_MS,
  WS_SLOW_SOCKET_BUFFERED_BYTES,
} from "@repo/backend-common";
import type {
  PresenceParticipant,
  PresencePointer,
  PresenceViewport,
  ServerToClientPresenceMessage,
} from "@repo/common";

/**
 * In-memory presence rooms (Phase 14).
 *
 * One entry represents one tab (connection), never one user: two tabs of the
 * same user keep distinct connection IDs. No pointer or viewport state is
 * written to PostgreSQL, IndexedDB, or scene JSON — it lives here only.
 */

export const OPEN_READY_STATE = 1;

export interface PresenceSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string): void;
  ping(): void;
  terminate(): void;
  close(code?: number, reason?: string): void;
}

export interface RoomConnection {
  connectionId: string;
  roomId: number;
  userId: string;
  displayName: string;
  ws: PresenceSocket;
  isAlive: boolean;
  pointer?: PresencePointer;
  viewport?: PresenceViewport;
  messageTimestamps: number[];
}

export type RoomMap = Map<number, Map<string, RoomConnection>>;

export function createRoomMap(): RoomMap {
  return new Map();
}

export function addConnection(rooms: RoomMap, connection: RoomConnection): void {
  let room = rooms.get(connection.roomId);
  if (!room) {
    room = new Map();
    rooms.set(connection.roomId, room);
  }
  room.set(connection.connectionId, connection);
}

/** Remove exactly one tab; delete the room when it becomes empty. */
export function removeConnection(
  rooms: RoomMap,
  roomId: number,
  connectionId: string,
): RoomConnection | null {
  const room = rooms.get(roomId);
  const connection = room?.get(connectionId) ?? null;
  if (!room || !connection) return null;
  room.delete(connectionId);
  if (room.size === 0) rooms.delete(roomId);
  return connection;
}

export function snapshotParticipants(
  rooms: RoomMap,
  roomId: number,
): PresenceParticipant[] {
  const room = rooms.get(roomId);
  if (!room) return [];
  return [...room.values()].map((connection) => {
    const participant: PresenceParticipant = {
      connectionId: connection.connectionId,
      userId: connection.userId,
      displayName: connection.displayName,
    };
    if (connection.pointer) participant.pointer = { ...connection.pointer };
    if (connection.viewport) participant.viewport = { ...connection.viewport };
    return participant;
  });
}

function safeSend(ws: PresenceSocket, message: ServerToClientPresenceMessage): void {
  if (ws.readyState !== OPEN_READY_STATE) return;
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // Delivery is best effort; heartbeat cleanup reaps dead sockets.
  }
}

/**
 * Fan out one message to every open socket in the room. Pointer and viewport
 * deltas are ephemeral: slow sockets (large kernel buffer) skip them instead
 * of accumulating unbounded backlog. Membership events always go through.
 */
export function sendToRoom(
  rooms: RoomMap,
  roomId: number,
  message: ServerToClientPresenceMessage,
  options?: { exceptConnectionId?: string },
): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const ephemeral =
    message.type === "pointer.move" ||
    message.type === "viewport.update" ||
    message.type === "pointer.leave";
  for (const connection of room.values()) {
    if (
      options?.exceptConnectionId !== undefined &&
      connection.connectionId === options.exceptConnectionId
    ) {
      continue;
    }
    if (
      ephemeral &&
      connection.ws.bufferedAmount > WS_SLOW_SOCKET_BUFFERED_BYTES
    ) {
      continue;
    }
    safeSend(connection.ws, message);
  }
}

/** Sliding-window rate limiter; returns false and keeps the sample on excess. */
export function checkRateLimit(
  connection: Pick<RoomConnection, "messageTimestamps">,
  now: number,
  maxMessages: number = WS_RATE_LIMIT_MAX_MESSAGES,
  windowMs: number = WS_RATE_LIMIT_WINDOW_MS,
): boolean {
  const recent = connection.messageTimestamps.filter(
    (timestamp) => now - timestamp < windowMs,
  );
  if (recent.length >= maxMessages) {
    connection.messageTimestamps = recent;
    return false;
  }
  recent.push(now);
  connection.messageTimestamps = recent;
  return true;
}

export interface DepartedConnection {
  roomId: number;
  connection: RoomConnection;
}

/**
 * One heartbeat sweep: ping live sockets, terminate those that missed the
 * previous pong, and remove exactly their entries. Returns departures so the
 * caller can broadcast `presence.left` for each.
 */
export function sweepHeartbeats(rooms: RoomMap): DepartedConnection[] {
  const departed: DepartedConnection[] = [];
  for (const [roomId, room] of rooms) {
    for (const connection of room.values()) {
      if (!connection.isAlive) {
        try {
          connection.ws.terminate();
        } catch {
          // Termination itself is best effort.
        }
        const removed = removeConnection(rooms, roomId, connection.connectionId);
        if (removed) departed.push({ roomId, connection: removed });
        continue;
      }
      connection.isAlive = false;
      try {
        connection.ws.ping();
      } catch {
        // A failed ping looks like a missed pong on the next sweep.
      }
    }
  }
  return departed;
}

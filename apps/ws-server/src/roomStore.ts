import {
  WS_RATE_LIMIT_MAX_MESSAGES,
  WS_RATE_LIMIT_WINDOW_MS,
  WS_SLOW_SOCKET_BUFFERED_BYTES,
} from "@repo/backend-common";
import type {
  PresenceParticipant,
  PresencePointer,
  PresenceViewport,
  RoomRole,
  ServerToClientCollabMessage,
  ServerToClientPresenceMessage,
} from "@repo/common";

/**
 * In-memory room connections (presence + collaboration).
 *
 * One entry represents one tab (connection), never one user: two tabs of the
 * same user keep distinct connection IDs. Pointer, viewport, preview, and
 * selection state are ephemeral — never written to PostgreSQL, IndexedDB, or
 * scene JSON. Only committed element deltas reach the durable authority.
 */

export const OPEN_READY_STATE = 1;

export type { RoomRole };

export type ServerToRoomMessage =
  | ServerToClientPresenceMessage
  | ServerToClientCollabMessage;

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
  sceneId: string | null;
  userId: string;
  displayName: string;
  role: RoomRole;
  /** True when the collab subprotocol was negotiated for this socket. */
  collab: boolean;
  ws: PresenceSocket;
  isAlive: boolean;
  pointer?: PresencePointer;
  viewport?: PresenceViewport;
  selection: string[];
  allMessageTimestamps?: number[];
  messageTimestamps: number[];
  commitTimestamps: number[];
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

function safeSend(ws: PresenceSocket, message: ServerToRoomMessage): void {
  if (ws.readyState !== OPEN_READY_STATE) return;
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // Delivery is best effort; heartbeat cleanup reaps dead sockets.
  }
}

/** Unicast to one tab (acks, snapshots, chunks). */
export function sendToConnection(
  connection: RoomConnection,
  message: ServerToRoomMessage,
): void {
  safeSend(connection.ws, message);
}

/**
 * Fan out one message to every open socket in the room. Ephemeral frames
 * (pointer, viewport, previews, selections) are best effort: slow sockets
 * (large kernel buffer) skip them instead of accumulating unbounded backlog.
 * Membership and durable collaboration events always go through.
 */
export function sendToRoom(
  rooms: RoomMap,
  roomId: number,
  message: ServerToRoomMessage,
  options?: { exceptConnectionId?: string },
): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const ephemeral =
    message.type === "pointer.move" ||
    message.type === "viewport.update" ||
    message.type === "pointer.leave" ||
    message.type === "elements.preview" ||
    message.type === "elements.pending" ||
    message.type === "elements.preview.end" ||
    message.type === "selection.update";
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

/** Sliding-window rate limiter over one timestamp bucket. */
export function checkRateLimit(
  timestamps: number[],
  now: number,
  maxMessages: number = WS_RATE_LIMIT_MAX_MESSAGES,
  windowMs: number = WS_RATE_LIMIT_WINDOW_MS,
): { allowed: boolean; timestamps: number[] } {
  const recent = timestamps.filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= maxMessages) {
    return { allowed: false, timestamps: recent };
  }
  recent.push(now);
  return { allowed: true, timestamps: recent };
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

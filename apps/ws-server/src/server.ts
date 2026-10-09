import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import {
  isOriginAllowed,
  parseRoomIdFromPath,
  parseTicketFromProtocols,
  WS_CLOSE_MEMBERSHIP_REVOKED,
  WS_CLOSE_POLICY,
  WS_HEARTBEAT_INTERVAL_MS,
  WS_MAX_PAYLOAD_BYTES,
  WS_MEMBERSHIP_RECHECK_MS,
} from "@repo/backend-common";
import {
  PRESENCE_WS_PROTOCOL,
  validateClientPresenceMessage,
  type ServerToClientPresenceMessage,
} from "@repo/common";
import {
  addConnection,
  checkRateLimit,
  createRoomMap,
  removeConnection,
  sendToRoom,
  snapshotParticipants,
  sweepHeartbeats,
  type RoomConnection,
  type RoomMap,
} from "./roomStore.js";

export interface VerifiedTicket {
  userId: string;
  roomId: number;
  ticketId: string;
}

export interface PresenceServerOptions {
  verifyTicket: (token: string) => VerifiedTicket;
  checkAccess: (roomId: number, userId: string) => Promise<boolean>;
  resolveDisplayName: (userId: string) => Promise<string>;
  allowedOrigins?: string[];
  heartbeatIntervalMs?: number;
  membershipRecheckMs?: number;
  maxPayloadBytes?: number;
  host?: string;
  port?: number;
}

export interface PresenceServerHandle {
  url: string;
  port: number;
  rooms: RoomMap;
  close: () => Promise<void>;
}

interface AuthedUpgrade {
  roomId: number;
  userId: string;
  displayName: string;
}

function rejectUpgrade(socket: Duplex, status: number): void {
  const reason =
    status === 401
      ? "Unauthorized"
      : status === 403
        ? "Forbidden"
        : status === 404
          ? "Not Found"
          : "Error";
  try {
    socket.write(
      `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    );
  } catch {
    // The socket may already be gone; fall through to destroy.
  }
  try {
    socket.destroy();
  } catch {
    // Destroying is best effort.
  }
}

function sendError(connection: RoomConnection, message: string): void {
  if (connection.ws.readyState !== 1) return;
  const payload: ServerToClientPresenceMessage = { type: "error", message };
  try {
    connection.ws.send(JSON.stringify(payload));
  } catch {
    // Error replies are best effort.
  }
}

export async function startPresenceServer(
  options: PresenceServerOptions,
): Promise<PresenceServerHandle> {
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? WS_HEARTBEAT_INTERVAL_MS;
  const membershipRecheckMs =
    options.membershipRecheckMs ?? WS_MEMBERSHIP_RECHECK_MS;
  const allowedOrigins = options.allowedOrigins ?? [];
  const rooms = createRoomMap();

  const httpServer: Server = createServer();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: options.maxPayloadBytes ?? WS_MAX_PAYLOAD_BYTES,
    // Only the stable protocol is ever negotiated; the ticket entry is
    // consumed during authentication and never echoed back.
    handleProtocols: (protocols) =>
      protocols.has(PRESENCE_WS_PROTOCOL) ? PRESENCE_WS_PROTOCOL : false,
  });

  const broadcastSnapshot = (roomId: number) => {
    sendToRoom(rooms, roomId, {
      type: "presence.snapshot",
      participants: snapshotParticipants(rooms, roomId),
    });
  };

  const detach = (roomId: number, connectionId: string, userId: string) => {
    const removed = removeConnection(rooms, roomId, connectionId);
    if (!removed) return;
    sendToRoom(rooms, roomId, {
      type: "presence.left",
      connectionId,
      userId,
    });
  };

  wss.on("connection", (ws, request) => {
    const auth = (request as IncomingMessage & { presenceAuth?: AuthedUpgrade })
      .presenceAuth;
    if (!auth) {
      try {
        ws.close(WS_CLOSE_POLICY, "Missing upgrade authentication");
      } catch {
        // Closing is best effort.
      }
      return;
    }
    const connection: RoomConnection = {
      connectionId: randomUUID(),
      roomId: auth.roomId,
      userId: auth.userId,
      displayName: auth.displayName,
      ws,
      isAlive: true,
      messageTimestamps: [],
    };
    addConnection(rooms, connection);

    // The joiner immediately gets the full snapshot so ephemeral state
    // recovers without replay; everyone else learns about the new tab.
    sendToRoom(rooms, connection.roomId, {
      type: "presence.snapshot",
      participants: snapshotParticipants(rooms, connection.roomId),
    });
    sendToRoom(rooms, connection.roomId, {
      type: "presence.joined",
      participant: {
        connectionId: connection.connectionId,
        userId: connection.userId,
        displayName: connection.displayName,
      },
    }, { exceptConnectionId: connection.connectionId });

    ws.on("pong", () => {
      connection.isAlive = true;
    });
    ws.on("error", () => {
      // Cleanup happens on "close"; prevent unhandled error crashes.
    });
    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        sendError(connection, "Binary messages are not supported");
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString("utf8"));
      } catch {
        sendError(connection, "Invalid message");
        return;
      }
      const validated = validateClientPresenceMessage(parsed);
      if (!validated.ok) {
        sendError(connection, validated.error);
        return;
      }
      if (!checkRateLimit(connection, Date.now())) {
        sendError(connection, "Slow down");
        return;
      }
      const message = validated.message;
      if (message.type === "pointer.move") {
        connection.pointer = { x: message.x, y: message.y };
        sendToRoom(
          rooms,
          connection.roomId,
          {
            type: "pointer.move",
            connectionId: connection.connectionId,
            userId: connection.userId,
            x: message.x,
            y: message.y,
          },
          { exceptConnectionId: connection.connectionId },
        );
        return;
      }
      if (message.type === "viewport.update") {
        connection.viewport = { x: message.x, y: message.y, zoom: message.zoom };
        sendToRoom(
          rooms,
          connection.roomId,
          {
            type: "viewport.update",
            connectionId: connection.connectionId,
            userId: connection.userId,
            x: message.x,
            y: message.y,
            zoom: message.zoom,
          },
          { exceptConnectionId: connection.connectionId },
        );
        return;
      }
      delete connection.pointer;
      sendToRoom(
        rooms,
        connection.roomId,
        {
          type: "pointer.leave",
          connectionId: connection.connectionId,
          userId: connection.userId,
        },
        { exceptConnectionId: connection.connectionId },
      );
    });
    ws.on("close", () => {
      detach(connection.roomId, connection.connectionId, connection.userId);
    });
  });

  httpServer.on("upgrade", (request, socket, head) => {
    void (async () => {
      try {
        if ((request.method ?? "GET") !== "GET") {
          rejectUpgrade(socket, 404);
          return;
        }
        const pathname = (() => {
          try {
            return new URL(request.url ?? "/", "http://presence.local").pathname;
          } catch {
            return null;
          }
        })();
        const roomId = parseRoomIdFromPath(pathname);
        if (roomId === null) {
          rejectUpgrade(socket, 404);
          return;
        }
        const origin = request.headers.origin;
        if (!isOriginAllowed(origin, allowedOrigins)) {
          rejectUpgrade(socket, 403);
          return;
        }
        // The ticket travels in Sec-WebSocket-Protocol, never in a URL query.
        // The path room ID is only a routing hint, not authorization.
        const ticket = parseTicketFromProtocols(
          request.headers["sec-websocket-protocol"],
        );
        if (!ticket) {
          rejectUpgrade(socket, 401);
          return;
        }
        let claims: VerifiedTicket;
        try {
          claims = options.verifyTicket(ticket);
        } catch {
          // Never log the ticket itself.
          rejectUpgrade(socket, 401);
          return;
        }
        if (claims.roomId !== roomId) {
          rejectUpgrade(socket, 403);
          return;
        }
        let allowed: boolean;
        try {
          allowed = await options.checkAccess(roomId, claims.userId);
        } catch (error) {
          console.error("Presence membership check failed:", error);
          rejectUpgrade(socket, 500);
          return;
        }
        if (!allowed) {
          rejectUpgrade(socket, 403);
          return;
        }
        let displayName = "Someone";
        try {
          displayName = await options.resolveDisplayName(claims.userId);
        } catch (error) {
          console.error("Presence display-name lookup failed:", error);
        }
        // Only after auth and membership pass does the socket join the room.
        (
          request as IncomingMessage & { presenceAuth?: AuthedUpgrade }
        ).presenceAuth = { roomId, userId: claims.userId, displayName };
        wss.handleUpgrade(request, socket, head, (upgraded) => {
          wss.emit("connection", upgraded, request);
        });
      } catch (error) {
        console.error("Presence upgrade failed:", error);
        rejectUpgrade(socket, 500);
      }
    })();
  });

  const heartbeatTimer = setInterval(() => {
    const departed = sweepHeartbeats(rooms);
    for (const { roomId, connection } of departed) {
      sendToRoom(rooms, roomId, {
        type: "presence.left",
        connectionId: connection.connectionId,
        userId: connection.userId,
      });
    }
  }, heartbeatIntervalMs);
  heartbeatTimer.unref?.();

  const membershipTimer = setInterval(() => {
    void (async () => {
      for (const [, room] of rooms) {
        for (const connection of room.values()) {
          let allowed = true;
          try {
            allowed = await options.checkAccess(
              connection.roomId,
              connection.userId,
            );
          } catch (error) {
            // Transient lookup failures must not evict live participants.
            console.error("Presence membership recheck failed:", error);
            continue;
          }
          if (!allowed) {
            // A ticket proves only the initial handshake, so a revoked
            // member loses their sockets promptly instead of lingering.
            try {
              connection.ws.close(
                WS_CLOSE_MEMBERSHIP_REVOKED,
                "Room access revoked",
              );
            } catch {
              // Closing is best effort; heartbeat cleanup reaps the rest.
            }
          }
        }
      }
    })();
  }, membershipRecheckMs);
  membershipTimer.unref?.();

  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Presence server failed to listen.");
  }

  return {
    url: `ws://${host}:${address.port}`,
    port: address.port,
    rooms,
    close: async () => {
      clearInterval(heartbeatTimer);
      clearInterval(membershipTimer);
      await new Promise<void>((resolve, reject) => {
        wss.close((error) => (error ? reject(error) : resolve()));
      });
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) =>
          error ? reject(error) : resolve(),
        );
      });
    },
  };
}

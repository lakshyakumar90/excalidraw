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
  WS_MEMBERSHIP_RECHECK_MS,
  type CollaborationService,
} from "@repo/backend-common";
import {
  chunkElementsForSnapshot,
  COLLAB_WS_PROTOCOL,
  PRESENCE_WS_PROTOCOL,
  validateClientCollabMessage,
  validateClientPresenceMessage,
  WS_COLLAB_MAX_PAYLOAD_BYTES,
  WS_COMMIT_RATE_PER_SECOND,
  WS_EPHEMERAL_RATE_PER_SECOND,
  type ClientToServerCollabMessage,
} from "@repo/common";
import {
  addConnection,
  checkRateLimit,
  createRoomMap,
  removeConnection,
  sendToConnection,
  sendToRoom,
  snapshotParticipants,
  sweepHeartbeats,
  type RoomConnection,
  type RoomMap,
  type RoomRole,
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
  /** Room scene + role for collaboration; absent means sync unavailable. */
  resolveRoom?: (
    roomId: number,
    userId: string,
  ) => Promise<{ sceneId: string; role: RoomRole } | null>;
  /** Fresh edit role per mutation/interval; falls back to the stored role. */
  getRole?: (roomId: number, userId: string) => Promise<RoomRole | null>;
  /** Durable collaboration authority; absent means sync unavailable. */
  service?: Pick<CollaborationService, "applyCommit" | "readSyncScene">;
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
  sceneId: string | null;
  userId: string;
  displayName: string;
  role: RoomRole;
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
  try {
    connection.ws.send(JSON.stringify({ type: "error", message }));
  } catch {
    // Error replies are best effort.
  }
}

/** Collab message types by wire name, for choosing the sharper error. */
function looksLikeCollabMessage(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "scene.sync.request" ||
    type === "elements.commit" ||
    type === "elements.preview" ||
    type === "elements.preview.end" ||
    type === "selection.update"
  );
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
    maxPayload: options.maxPayloadBytes ?? WS_COLLAB_MAX_PAYLOAD_BYTES,
    // The ticket entry is consumed during authentication and never echoed.
    // Collab-capable browsers are offered the collaboration protocol;
    // presence-only clients keep the Phase 14 protocol.
    handleProtocols: (protocols) => {
      if (protocols.has(COLLAB_WS_PROTOCOL)) return COLLAB_WS_PROTOCOL;
      if (protocols.has(PRESENCE_WS_PROTOCOL)) return PRESENCE_WS_PROTOCOL;
      return false;
    },
  });

  const detach = (roomId: number, connectionId: string, userId: string) => {
    const removed = removeConnection(rooms, roomId, connectionId);
    if (!removed) return;
    sendToRoom(rooms, roomId, {
      type: "presence.left",
      connectionId,
      userId,
    });
  };

  async function currentRole(connection: RoomConnection): Promise<RoomRole> {
    if (!options.getRole) return connection.role;
    try {
      const role = await options.getRole(connection.roomId, connection.userId);
      if (role) {
        connection.role = role;
        return role;
      }
    } catch (error) {
      console.error("Presence role recheck failed:", error);
    }
    return connection.role;
  }

  async function handleCollabMessage(
    connection: RoomConnection,
    message: ClientToServerCollabMessage,
  ): Promise<void> {
    const service = options.service;
    if (!connection.collab || !service || !connection.sceneId) {
      sendError(connection, "Collaboration is not available on this connection");
      return;
    }
    switch (message.type) {
      case "scene.sync.request": {
        if (!consumeCommitBudget(connection)) {
          sendError(connection, "Slow down");
          return;
        }
        let snapshot: Awaited<ReturnType<typeof service.readSyncScene>>;
        try {
          snapshot = await service.readSyncScene(connection.sceneId);
        } catch (error) {
          console.error("Sync snapshot read failed:", error);
          sendError(connection, "Sync unavailable right now");
          return;
        }
        if (!snapshot) {
          sendError(connection, "Scene not found");
          return;
        }
        const chunks = chunkElementsForSnapshot(snapshot.elements);
        if (chunks.length <= 1) {
          sendToConnection(connection, {
            type: "scene.sync.snapshot",
            requestId: message.requestId,
            revision: snapshot.revision,
            elements: snapshot.elements,
            tombstones: snapshot.tombstones,
          });
          return;
        }
        sendToConnection(connection, {
          type: "scene.sync.snapshot",
          requestId: message.requestId,
          revision: snapshot.revision,
          elements: [],
          tombstones: snapshot.tombstones,
          chunks: { count: chunks.length },
        });
        chunks.forEach((elements, index) => {
          sendToConnection(connection, {
            type: "scene.sync.chunk",
            requestId: message.requestId,
            index,
            count: chunks.length,
            elements,
          });
        });
        return;
      }
      case "elements.commit": {
        if (!consumeCommitBudget(connection)) {
          sendError(connection, "Slow down");
          return;
        }
        const role = await currentRole(connection);
        if (role !== "owner" && role !== "editor") {
          sendToConnection(connection, {
            type: "elements.ack",
            mutationId: message.mutationId,
            revision: null,
            saved: false,
            reason: "forbidden",
          });
          return;
        }
        let result: Awaited<ReturnType<typeof service.applyCommit>>;
        try {
          result = await service.applyCommit({
            sceneId: connection.sceneId,
            userId: connection.userId,
            role,
            elements: message.elements,
            mutationId: message.mutationId,
          });
        } catch (error) {
          console.error("Sync commit failed:", error);
          sendToConnection(connection, {
            type: "elements.ack",
            mutationId: message.mutationId,
            revision: null,
            saved: false,
            reason: "unavailable",
          });
          return;
        }
        sendToConnection(connection, {
          type: "elements.ack",
          mutationId: message.mutationId,
          revision: result.revision,
          saved: result.saved,
          ...(result.corrected.length > 0 ? { corrected: result.corrected } : {}),
          ...(result.missingFiles ? { missingFiles: result.missingFiles } : {}),
          ...(result.reason ? { reason: result.reason } : {}),
        });
        // Replays are acknowledged but never rebroadcast: every replica
        // already converged on the first delivery.
        if (result.saved && !result.replayed) {
          sendToRoom(
            rooms,
            connection.roomId,
            {
              type: "elements.committed",
              mutationId: message.mutationId,
              connectionId: connection.connectionId,
              userId: connection.userId,
              revision: result.revision ?? 0,
              elements: result.winners,
            },
            { exceptConnectionId: connection.connectionId },
          );
        }
        return;
      }
      case "elements.preview": {
        if (!consumeEphemeralBudget(connection)) {
          return;
        }
        if (connection.role !== "owner" && connection.role !== "editor") {
          return;
        }
        sendToRoom(
          rooms,
          connection.roomId,
          {
            type: "elements.preview",
            connectionId: connection.connectionId,
            userId: connection.userId,
            gestureId: message.gestureId,
            seq: message.seq,
            elements: message.elements,
          },
          { exceptConnectionId: connection.connectionId },
        );
        return;
      }
      case "elements.preview.end": {
        if (!consumeEphemeralBudget(connection)) {
          return;
        }
        sendToRoom(
          rooms,
          connection.roomId,
          {
            type: "elements.preview.end",
            connectionId: connection.connectionId,
            userId: connection.userId,
            gestureId: message.gestureId,
          },
          { exceptConnectionId: connection.connectionId },
        );
        return;
      }
      case "selection.update": {
        if (!consumeEphemeralBudget(connection)) {
          return;
        }
        connection.selection = [...message.elementIds];
        sendToRoom(
          rooms,
          connection.roomId,
          {
            type: "selection.update",
            connectionId: connection.connectionId,
            userId: connection.userId,
            elementIds: [...message.elementIds],
          },
          { exceptConnectionId: connection.connectionId },
        );
        return;
      }
    }
  }

  function consumeEphemeralBudget(connection: RoomConnection): boolean {
    const checked = checkRateLimit(
      connection.messageTimestamps,
      Date.now(),
      WS_EPHEMERAL_RATE_PER_SECOND,
      1000,
    );
    connection.messageTimestamps = checked.timestamps;
    return checked.allowed;
  }

  function consumeCommitBudget(connection: RoomConnection): boolean {
    const checked = checkRateLimit(
      connection.commitTimestamps,
      Date.now(),
      WS_COMMIT_RATE_PER_SECOND,
      1000,
    );
    connection.commitTimestamps = checked.timestamps;
    return checked.allowed;
  }

  function handlePresencePayload(
    connection: RoomConnection,
    message: Extract<
      ReturnType<typeof validateClientPresenceMessage>,
      { ok: true }
    >["message"],
  ): void {
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
  }

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
      sceneId: auth.sceneId,
      userId: auth.userId,
      displayName: auth.displayName,
      role: auth.role,
      collab: (ws as { protocol?: string }).protocol === COLLAB_WS_PROTOCOL,
      ws,
      isAlive: true,
      selection: [],
      messageTimestamps: [],
      commitTimestamps: [],
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
      const presence = validateClientPresenceMessage(parsed);
      if (presence.ok) {
        if (!consumeEphemeralBudget(connection)) {
          sendError(connection, "Slow down");
          return;
        }
        handlePresencePayload(connection, presence.message);
        return;
      }
      const collab = validateClientCollabMessage(parsed);
      if (!collab.ok) {
        sendError(
          connection,
          looksLikeCollabMessage(parsed) ? collab.error : presence.error,
        );
        return;
      }
      void handleCollabMessage(connection, collab.message).catch((error: unknown) => {
        console.error("Collaboration message failed:", error);
        sendError(connection, "Sync unavailable right now");
      });
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
        let sceneId: string | null = null;
        let role: RoomRole = "viewer";
        if (options.resolveRoom) {
          try {
            const resolved = await options.resolveRoom(roomId, claims.userId);
            if (!resolved) {
              rejectUpgrade(socket, 403);
              return;
            }
            sceneId = resolved.sceneId;
            role = resolved.role;
          } catch (error) {
            console.error("Presence room lookup failed:", error);
            rejectUpgrade(socket, 500);
            return;
          }
        }
        // Only after auth and membership pass does the socket join the room.
        (
          request as IncomingMessage & { presenceAuth?: AuthedUpgrade }
        ).presenceAuth = { roomId, sceneId, userId: claims.userId, displayName, role };
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
            continue;
          }
          // Refresh the stored edit role so downgrades stop edits promptly
          // while presence continues.
          if (options.getRole) {
            try {
              const role = await options.getRole(
                connection.roomId,
                connection.userId,
              );
              if (role) connection.role = role;
            } catch (error) {
              console.error("Presence role refresh failed:", error);
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

export type { RoomRole };

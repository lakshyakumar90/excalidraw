import {
  verifyPresenceTicket,
  assertPresenceTicketConfiguration,
} from "@repo/auth/presence-ticket";
import {
  createCollaborationService,
  getAllowedWsOrigins,
} from "@repo/backend-common";
import { openRoomRedis } from "@repo/redis";
import { connectApplicationDatabase, db, getRoomSceneAccess } from "@repo/db";
import { startPresenceServer } from "./server.js";

async function hasRoomAccess(roomId: number, userId: string): Promise<boolean> {
  return (await getRoomSceneAccess(db, roomId, userId)) !== null;
}

async function displayNameFor(userId: string): Promise<string> {
  const user = await db.orm!.public!.User.where({ id: userId }).first();
  const name = user?.name?.trim();
  // Participant emails are never exposed over presence.
  return name ? name.slice(0, 120) : "Someone";
}

async function startServer() {
  // Fail startup when the ticket secret is absent or weak; there is no
  // hard-coded fallback. Tickets prove only the handshake — membership is
  // re-checked at upgrade time and on a bounded interval.
  assertPresenceTicketConfiguration();

  try {
    await connectApplicationDatabase();
  } catch (error) {
    console.error("Failed to connect to the database:", error);
    process.exit(1);
  }

  const port = Number(process.env.WS_PORT ?? 8080);
  const roomRedis = openRoomRedis();
  await roomRedis.redis.ping();
  const handle = await startPresenceServer({
    verifyTicket: verifyPresenceTicket,
    checkAccess: hasRoomAccess,
    resolveDisplayName: displayNameFor,
    resolveRoom: (roomId, userId) => getRoomSceneAccess(db, roomId, userId),
    getRole: async (roomId, userId) =>
      (await getRoomSceneAccess(db, roomId, userId))?.role ?? null,
    service: createCollaborationService({ store: db, liveStore: roomRedis }),
    roomRedis,
    allowedOrigins: getAllowedWsOrigins(),
    port,
  });
  console.log(`Presence server is running on port ${handle.port}`);

  const shutdown = () => {
    void handle
      .close()
      .catch((error: unknown) => {
        console.error("Error while stopping the presence server:", error);
      })
      .finally(() => roomRedis.close().finally(() => process.exit(0)));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void startServer();

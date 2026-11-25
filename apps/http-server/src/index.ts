import { connectDatabase, pingDatabase } from "@repo/db";
import { assertAuthConfiguration } from "@repo/auth";
import { configureCollaborationLiveStore } from "@repo/backend-common";
import { openRoomRedis } from "@repo/redis";
import { configureInvitationRateLimiter } from "./invitationRateLimit.js";
import { configureGlobalRateLimiter } from "./rateLimitMiddleware.js";
import { configureMcpServerDeps } from "./routes/mcp.js";
import { configureRevisionBroadcast } from "./routes/revisions.js";
import { configureFileMetadataStore } from "./routes/files.js";
import { app, configureHealthChecks } from "./app.js";

async function startServer() {
  assertAuthConfiguration();

  try {
    await connectDatabase();
    const roomRedis = openRoomRedis();
    await roomRedis.redis.ping();
    configureCollaborationLiveStore(roomRedis);
    configureInvitationRateLimiter(roomRedis);
    configureGlobalRateLimiter(roomRedis);
    configureMcpServerDeps({ getRoomRedis: () => roomRedis });
    configureRevisionBroadcast(roomRedis);
    configureFileMetadataStore(roomRedis.redis);
    configureHealthChecks({
      pingDb: () => pingDatabase(2_000),
      pingRedis: () => roomRedis.ping(2_000),
    });

    const port = Number(process.env.PORT ?? 5000);
    const server = app.listen(port, () => {
      console.log(`HTTP server is running on port ${port}`);
    });
    const shutdown = () => {
      server.close(() => {
        void roomRedis.close().finally(() => process.exit(0));
      });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Failed to initialize the HTTP server:", error);
    process.exit(1);
  }
}

void startServer();

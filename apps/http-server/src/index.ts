import { connectDatabase } from "@repo/db";
import { assertAuthConfiguration } from "@repo/auth";
import { configureCollaborationLiveStore } from "@repo/backend-common";
import { openRoomRedis } from "@repo/redis";
import { app } from "./app.js";

async function startServer() {
  assertAuthConfiguration();

  try {
    await connectDatabase();
    const roomRedis = openRoomRedis();
    await roomRedis.redis.ping();
    configureCollaborationLiveStore(roomRedis);

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

import {
  connectApplicationDatabase,
  db,
  insertSceneRevision,
  readSyncHead,
  retainLatestSceneRevisions,
} from "@repo/db";
import { openRoomRedis, ROOM_SNAPSHOT_KEEP } from "@repo/redis";

async function start() {
  await connectApplicationDatabase();
  const rooms = openRoomRedis();
  await rooms.redis.ping();
  const worker = await rooms.startWorker(async (snapshot) => {
    const head = await readSyncHead(db, snapshot.sceneId);
    if (!head || head.revision < snapshot.revision) {
      await insertSceneRevision(
        db,
        snapshot.sceneId,
        snapshot.revision,
        snapshot.data,
        snapshot.actorId,
      );
    }
    await retainLatestSceneRevisions(db, snapshot.sceneId, ROOM_SNAPSHOT_KEEP);
  }, 1);
  worker.on("failed", (job, error) => {
    console.error(
      `Room flush failed${job ? ` for ${job.data.sceneId}` : ""}:`,
      error,
    );
  });

  // The dirty sorted set closes the Redis-write/queue-enqueue crash gap and
  // recovers fixed-ID jobs that were active when a new version arrived.
  const recoveryTimer = setInterval(() => {
    void (async () => {
      for (const sceneId of await rooms.dirtyRooms())
        await rooms.scheduleFlush(sceneId);
    })().catch((error: unknown) =>
      console.error("Flush recovery scan failed:", error),
    );
  }, 5_000);
  recoveryTimer.unref?.();

  let memoryLoggedAt = 0;
  const metricsTimer = setInterval(() => {
    void (async () => {
      const rates = await rooms.roomMessageRates();
      for (const rate of rates) {
        console.info(
          JSON.stringify({ metric: "room_messages_per_second", ...rate }),
        );
      }
      if (Date.now() - memoryLoggedAt >= 60_000) {
        const info = await rooms.redis.info("memory");
        const usedMemory = info.match(/(?:^|\r?\n)used_memory:(\d+)/)?.[1];
        if (usedMemory)
          console.info(
            JSON.stringify({
              metric: "redis_used_memory_bytes",
              value: Number(usedMemory),
            }),
          );
        memoryLoggedAt = Date.now();
      }
    })().catch((error: unknown) =>
      console.error("Metrics collection failed:", error),
    );
  }, 10_000);
  metricsTimer.unref?.();

  const shutdown = () => {
    clearInterval(recoveryTimer);
    clearInterval(metricsTimer);
    void worker
      .close()
      .finally(() => rooms.close().finally(() => process.exit(0)));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  console.log("Room snapshot flush worker is running");
}

void start().catch((error: unknown) => {
  console.error("Failed to start room snapshot flush worker:", error);
  process.exit(1);
});

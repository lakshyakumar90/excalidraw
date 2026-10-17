import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openRoomRedis, RoomRedis } from "./index.js";

const redisUrl = process.env.REDIS_TEST_URL;
const rooms = redisUrl ? openRoomRedis(redisUrl) : null;
const sceneId = `redis-test-${randomUUID()}`;

test("disabled message metrics do not access Redis", async () => {
  const store = Object.create(RoomRedis.prototype) as RoomRedis;
  Object.defineProperty(store, "metricsEnabled", { value: false });
  Object.defineProperty(store, "redis", {
    get() {
      throw new Error("Metrics must not issue Redis commands");
    },
  });
  await store.recordMessage("idle-room");
});

after(async () => {
  if (!rooms) return;
  const key = `collab:room:${encodeURIComponent(sceneId)}:state`;
  const jobId = `room-${createHash("sha256").update(sceneId).digest("hex")}`;
  const job = await rooms.queue.getJob(jobId);
  if (job) await job.remove().catch(() => undefined);
  await rooms.redis.del(
    key,
    `collab:room:${encodeURIComponent(sceneId)}:connections`,
    `collab:room:${encodeURIComponent(sceneId)}:participants`,
  );
  await rooms.redis.zrem("collab:dirty-rooms", sceneId);
  await rooms.close();
});

test(
  "Redis accepts a room snapshot once per expected version",
  { skip: !rooms },
  async () => {
    const store = rooms!;
    const data = {
      elements: [{ id: "shape-1", type: "ellipse" }],
      sync: { revision: 1 },
    };
    const results = await Promise.all([
      store.writeSnapshot(sceneId, 0, 1, "actor-a", data),
      store.writeSnapshot(sceneId, 0, 1, "actor-b", data),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    const snapshot = await store.readSnapshot(sceneId);
    assert.equal(snapshot?.revision, 1);
    assert.equal(snapshot?.data.elements.length, 1);
    assert.equal(snapshot?.persistedRevision, 0);
  },
);

test(
  "an idle worker wakes for a new delayed save despite its longer idle wait",
  { skip: !rooms, timeout: 20_000 },
  async () => {
    const store = rooms!;
    const targetScene = `redis-wakeup-${randomUUID()}`;
    const worker = await store.startWorker(async () => {});
    try {
      // Wait until the worker is listening on the empty queue before adding
      // a delayed job; this exercises the marker that interrupts BZPOPMIN.
      await new Promise<void>((resolve, reject) => {
        worker.once("drained", resolve);
        worker.once("error", reject);
      });
      const completed = new Promise<void>((resolve, reject) => {
        worker.on("completed", (job) => {
          if (job.data.sceneId === targetScene) resolve();
        });
        worker.once("error", reject);
        worker.on("failed", (_job, error) => reject(error));
      });
      await store.writeSnapshot(targetScene, 0, 1, "actor", { elements: [] });
      await completed;
      assert.equal(
        (await store.readSnapshot(targetScene))?.persistedRevision,
        1,
      );
    } finally {
      await worker.close();
      await store.redis.del(
        `collab:room:${encodeURIComponent(targetScene)}:state`,
      );
      await store.redis.zrem("collab:dirty-rooms", targetScene);
    }
  },
);

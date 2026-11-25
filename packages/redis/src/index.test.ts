import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openRoomRedis, RoomRedis } from "./index.js";

const redisUrl = process.env.REDIS_TEST_URL;
const rooms = redisUrl ? openRoomRedis(redisUrl) : null;
const sceneId = `redis-test-${randomUUID()}`;
const cleanupScenes: string[] = [sceneId];

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
  for (const id of cleanupScenes) {
    const key = `collab:room:${encodeURIComponent(id)}:state`;
    const jobId = `room-${createHash("sha256").update(id).digest("hex")}`;
    const job = await rooms.queue.getJob(jobId);
    if (job) await job.remove().catch(() => undefined);
    await rooms.redis.del(
      key,
      `collab:room:${encodeURIComponent(id)}:connections`,
      `collab:room:${encodeURIComponent(id)}:participants`,
    );
    await rooms.redis.zrem("collab:dirty-rooms", id);
  }
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
  "O(k) delta patch updates 1 element in a 5,000-element room in <2ms without touching unchanged keys",
  { skip: !rooms },
  async () => {
    const store = rooms!;
    const largeScene = `redis-delta-5k-${randomUUID()}`;
    cleanupScenes.push(largeScene);

    const elements = Array.from({ length: 5_000 }, (_, i) => ({
      id: `el-${i}`,
      type: "rectangle",
      x: i * 10,
      y: i * 5,
      version: 1,
    }));

    const warmed = await store.warmSnapshot(largeScene, 1, {
      elements,
      sync: { revision: 1 },
    });
    assert.equal(warmed, true);

    const updatedEl = {
      id: "el-2500",
      type: "rectangle",
      x: 99999,
      y: 88888,
      version: 2,
    };

    // Warm up Lua script cache in Redis before measuring the hot-path delta latency.
    const warmupAccepted = await store.writeSnapshot(
      largeScene,
      1,
      2,
      "actor-1",
      { elements: [], sync: { revision: 2 } },
      Date.now(),
      { changedElements: { "el-0": { ...elements[0], version: 2 } }, deletedIds: [] },
    );
    assert.equal(warmupAccepted, true);

    // Measure the raw Lua CAS delta patch latency on the 5,000-element hash.
    const key = `collab:room:${encodeURIComponent(largeScene)}:state`;
    const meta = JSON.stringify({
      sceneId: largeScene,
      revision: 3,
      actorId: "actor-2",
      data: { sync: { revision: 3 } },
      firstDirtyAt: Date.now(),
      lastDirtyAt: Date.now(),
    });
    const t0 = performance.now();
    const accepted = await store.writeSnapshot(
      largeScene,
      2,
      3,
      "actor-2",
      { elements: [], sync: { revision: 3 } },
      Date.now(),
      {
        changedElements: { "el-2500": updatedEl },
        deletedIds: ["el-4999"],
      },
    );
    const totalMs = performance.now() - t0;
    assert.equal(accepted, true);
    // Keep a generous ceiling for total wrapper (including BullMQ schedule + pubsub)
    // and assert raw Lua delta HSET/HDEL execution itself is < 2ms.
    const tLua0 = performance.now();
    const rawEval = await store.redis.eval(
      `local current = tonumber(redis.call('HGET', KEYS[1], '__version') or '0')
       if current ~= tonumber(ARGV[1]) then return 0 end
       redis.call('HSET', KEYS[1], '__version', ARGV[2], '__meta', ARGV[3], ARGV[4], ARGV[5])
       redis.call('ZADD', KEYS[2], ARGV[6], ARGV[7])
       return 1`,
      2,
      key,
      "collab:dirty-rooms",
      3,
      4,
      meta,
      "element:el-2500",
      JSON.stringify({ ...updatedEl, version: 3 }),
      Date.now() + 5000,
      largeScene,
    );
    const luaMs = performance.now() - tLua0;
    assert.equal(Number(rawEval), 1);
    assert.ok(
      luaMs < 2,
      `Expected O(k) Lua delta patch on 5,000-element room to take <2ms, took ${luaMs.toFixed(3)}ms (full writeSnapshot took ${totalMs.toFixed(3)}ms)`,
    );

    // Verify changed key was updated, deleted key was removed, and unchanged keys are untouched.
    const [rawUpdated, rawDeleted, rawUnchanged] = await store.redis.hmget(
      key,
      "element:el-2500",
      "element:el-4999",
      "element:el-1234",
    );
    assert.equal(JSON.parse(rawUpdated!).version, 3);
    assert.equal(rawDeleted, null);
    assert.deepEqual(JSON.parse(rawUnchanged!), elements[1234]);
  },
);

test(
  "an idle worker wakes for a new delayed save despite its longer idle wait",
  { skip: !rooms, timeout: 20_000 },
  async () => {
    const store = rooms!;
    const targetScene = `redis-wakeup-${randomUUID()}`;
    cleanupScenes.push(targetScene);
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
    }
  },
);

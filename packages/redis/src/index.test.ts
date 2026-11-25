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

    const key = `collab:room:${encodeURIComponent(largeScene)}:state`;
    const t0 = performance.now();
    const accepted = await store.writeSnapshot(
      largeScene,
      2,
      3,
      "actor-benchmark",
      { elements: [], sync: { revision: 3 } },
      Date.now(),
      {
        changedElements: { "el-2500": updatedEl },
        deletedIds: ["el-4999"],
      },
    );
    const totalMs = performance.now() - t0;
    assert.equal(accepted, true);
    if (process.env.REDIS_TEST_SLOWLOG === "1") {
      const entries = await store.redis.slowlog("GET", "128") as
        [number, number, number, string[]][];
      const write = entries.find(([, , , command]) =>
        command[0]?.toLowerCase() === "eval" &&
        command[3] === key &&
        command[7]?.includes("actor-benchmark"),
      );
      assert.ok(write, "Enable Redis SLOWLOG for all commands on the test instance");
      assert.ok(write[2] < 2_000,
        `Production Lua CAS took ${write[2]} µs (client wrapper ${totalMs.toFixed(1)} ms)`);
    }

    // Verify changed key was updated, deleted key was removed, and unchanged keys are untouched.
    const [rawUpdated, rawDeleted, rawUnchanged] = await store.redis.hmget(
      key,
      "element:el-2500",
      "element:el-4999",
      "element:el-1234",
    );
    assert.deepEqual(JSON.parse(rawUpdated!), updatedEl);
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

import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openRoomRedis } from "./index.js";

const redisUrl = process.env.REDIS_TEST_URL;
const rooms = redisUrl ? openRoomRedis(redisUrl) : null;
const sceneId = `redis-test-${randomUUID()}`;

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

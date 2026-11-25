import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { openRoomRedis } from "@repo/redis";
import { createCollaborationService } from "./collaboration.js";

const redisUrl = process.env.REDIS_TEST_URL ?? "redis://127.0.0.1:6379";
const rooms = openRoomRedis(redisUrl);
const createdScenes: string[] = [];

afterAll(async () => {
  for (const sceneId of createdScenes) {
    await rooms.redis.del(
      `collab:room:${encodeURIComponent(sceneId)}:state`,
      `collab:room:${encodeURIComponent(sceneId)}:connections`,
      `collab:room:${encodeURIComponent(sceneId)}:participants`,
    );
    await rooms.redis.zrem("collab:dirty-rooms", sceneId);
  }
  await rooms.close();
});

function makeValidRect(id: string) {
  return {
    id,
    type: "rectangle",
    x: 10,
    y: 20,
    width: 100,
    height: 60,
    version: 1,
    versionNonce: 67890,
  };
}

describe("distributed mutation deduplication across server replicas", () => {
  it("deduplicates the same mutationId across two independent server instances via Redis", async () => {
    const sceneId = `dedup-scene-${randomUUID()}`;
    const mutationId = `mut-${randomUUID()}`;
    createdScenes.push(sceneId);

    const dbQueries = {
      readHead: async () => ({
        revision: 0,
        data: { elements: [], sync: { revision: 0, tombstones: {} } },
      }),
      readLegacy: async () => null,
      appendRevision: async () => undefined,
      pruneRevisions: async () => undefined,
    };

    // Two completely separate collaboration service instances (simulating 2 WS/HTTP pods).
    const instanceA = createCollaborationService({
      store: {} as never,
      queries: dbQueries,
      liveStore: rooms,
    });
    const instanceB = createCollaborationService({
      store: {} as never,
      queries: dbQueries,
      liveStore: rooms,
    });

    const rect = makeValidRect("rect-1");

    const first = await instanceA.applyCommit({
      sceneId,
      userId: "user-1",
      role: "editor",
      elements: [rect],
      mutationId,
    });
    expect(first.saved).toBe(true);
    expect(first.replayed).toBe(false);
    expect(first.revision).toBe(1);

    // Instance B has an empty local Map, so it must catch the duplicate via Redis.
    const second = await instanceB.applyCommit({
      sceneId,
      userId: "user-1",
      role: "editor",
      elements: [rect],
      mutationId,
    });
    expect(second.saved).toBe(true);
    expect(second.replayed).toBe(true);
    expect(second.revision).toBe(1);

    // Snapshot revision in Redis must still be 1 (not bumped to 2).
    const snapshot = await rooms.readSnapshot(sceneId);
    expect(snapshot?.revision).toBe(1);
  });

  it("falls back cleanly to local seenMutations when Redis dedup fails", async () => {
    const sceneId = `dedup-fallback-${randomUUID()}`;
    const mutationId = `mut-fb-${randomUUID()}`;
    let rev = 0;
    let storedData: unknown = { elements: [], sync: { revision: 0, tombstones: {} } };

    const brokenRedisStore = {
      readSnapshot: async () => null,
      warmSnapshot: async () => true,
      writeSnapshot: async () => {
        rev += 1;
        return true;
      },
      claimMutation: async () => {
        throw new Error("Redis connection reset");
      },
      getMutationResult: async () => {
        throw new Error("Redis connection reset");
      },
      storeMutationResult: async () => {
        throw new Error("Redis connection reset");
      },
    };

    const svc = createCollaborationService({
      store: {} as never,
      queries: {
        readHead: async () => ({ revision: rev, data: storedData }),
        readLegacy: async () => null,
        appendRevision: async (_s, r, d) => {
          rev = r;
          storedData = d;
        },
        pruneRevisions: async () => undefined,
      },
      liveStore: brokenRedisStore,
    });

    const rect = makeValidRect("rect-fb");
    const first = await svc.applyCommit({
      sceneId,
      userId: "user-1",
      role: "editor",
      elements: [rect],
      mutationId,
    });
    expect(first.saved).toBe(true);
    expect(first.replayed).toBe(false);

    const second = await svc.applyCommit({
      sceneId,
      userId: "user-1",
      role: "editor",
      elements: [rect],
      mutationId,
    });
    expect(second.saved).toBe(true);
    expect(second.replayed).toBe(true);
  });
});

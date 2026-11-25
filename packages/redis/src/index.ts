import { createHash, randomUUID } from "node:crypto";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";

export const ROOM_FLUSH_QUEUE = "room-snapshot-flush";
export const ROOM_SNAPSHOT_KEEP = 20;
export const ROOM_DEBOUNCE_MS = 5_000;
export const ROOM_MAX_WAIT_MS = 30_000;
export const ROOM_REDIS_GRACE_MS = 60_000;
export const MUTATION_DEDUP_TTL_SECONDS = 300;
export const FLUSH_LOCK_TTL_MS = 15_000;

export interface RoomSnapshot {
  sceneId: string;
  revision: number;
  actorId: string;
  data: Record<string, unknown> & { elements: unknown[] };
  persistedRevision: number;
  firstDirtyAt: number;
  lastDirtyAt: number;
}

export interface SnapshotDelta {
  /** Map of element id -> element object (or serialized JSON string) to HSET. */
  changedElements: Record<string, unknown>;
  /** Element IDs to HDEL from the room hash. */
  deletedIds?: string[];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

const roomHashKey = (sceneId: string) =>
  `collab:room:${encodeURIComponent(sceneId)}:state`;
const roomConnectionsKey = (sceneId: string) =>
  `collab:room:${encodeURIComponent(sceneId)}:connections`;
const roomParticipantsKey = (sceneId: string) =>
  `collab:room:${encodeURIComponent(sceneId)}:participants`;
const mutationKey = (sceneId: string, mutationId: string) =>
  `collab:mut:${encodeURIComponent(sceneId)}:${encodeURIComponent(mutationId)}`;
const mutationResultKey = (sceneId: string, mutationId: string) =>
  `collab:mut-res:${encodeURIComponent(sceneId)}:${encodeURIComponent(mutationId)}`;
const flushLockKey = (sceneId: string) =>
  `lock:flush:${encodeURIComponent(sceneId)}`;

const RELEASE_LOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;
const DIRTY_KEY = "collab:dirty-rooms";
const METRIC_ROOMS_KEY = "collab:metric-rooms";
const EVENTS_CHANNEL = "collab:events";

/**
 * Atomic CAS Lua script supporting both O(k) delta HSET/HDEL patches and
 * full-hash initialization/replacement (when ARGV[4] == '1').
 */
const WRITE_SNAPSHOT_LUA = `
local current = tonumber(redis.call('HGET', KEYS[1], '__version') or '0')
local expected = tonumber(ARGV[1])
if current ~= expected and current ~= 0 then
  return 0
end
local isFullReplace = tonumber(ARGV[4])
if isFullReplace == 1 then
  local old = redis.call('HKEYS', KEYS[1])
  for _, field in ipairs(old) do
    if string.sub(field, 1, 8) == 'element:' then
      redis.call('HDEL', KEYS[1], field)
    end
  end
elseif current == 0 and expected > 0 then
  -- Cannot apply a delta patch onto a cold/evicted room hash; force caller to re-read/warm.
  return 0
end
redis.call('HSET', KEYS[1], '__version', ARGV[2], '__meta', ARGV[3])
local changedCount = tonumber(ARGV[5])
local idx = 6
for i = 1, changedCount do
  redis.call('HSET', KEYS[1], ARGV[idx], ARGV[idx + 1])
  idx = idx + 2
end
local deletedCount = tonumber(ARGV[idx])
idx = idx + 1
for i = 1, deletedCount do
  redis.call('HDEL', KEYS[1], ARGV[idx])
  idx = idx + 1
end
redis.call('ZADD', KEYS[2], ARGV[idx], ARGV[idx + 1])
return 1
`;

/** Redis live snapshots and the write-behind queue share one configured Redis URL. */
export class RoomRedis {
  readonly redis: Redis;
  readonly queue: Queue;
  readonly instanceId = randomUUID();
  readonly metricsEnabled = process.env.REDIS_METRICS_ENABLED === "true";

  constructor(url = process.env.REDIS_URL) {
    if (!url) throw new Error("REDIS_URL must be configured.");
    this.redis = new Redis(url, {
      ...(url.startsWith("rediss://")
        ? { tls: { servername: new URL(url).hostname } }
        : {}),
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.queue = new Queue(ROOM_FLUSH_QUEUE, {
      connection: this.redis,
    });
  }

  /** O(1) metadata-only read avoiding full HGETALL on hot paths. */
  private async readSnapshotMeta(sceneId: string): Promise<{
    revision: number;
    persistedRevision: number;
    firstDirtyAt: number;
    lastDirtyAt: number;
  } | null> {
    const [rawMeta, rawVersion, rawPersisted] = await this.redis.hmget(
      roomHashKey(sceneId),
      "__meta",
      "__version",
      "__persisted",
    );
    if (!rawMeta) return null;
    const meta = JSON.parse(rawMeta) as {
      revision?: number;
      firstDirtyAt?: number;
      lastDirtyAt?: number;
    };
    const now = Date.now();
    return {
      revision: Number(rawVersion ?? meta.revision ?? 0),
      persistedRevision: Number(rawPersisted ?? 0),
      firstDirtyAt: typeof meta.firstDirtyAt === "number" ? meta.firstDirtyAt : now,
      lastDirtyAt: typeof meta.lastDirtyAt === "number" ? meta.lastDirtyAt : now,
    };
  }

  async readSnapshot(sceneId: string): Promise<RoomSnapshot | null> {
    const values = await this.redis.hgetall(roomHashKey(sceneId));
    const rawMeta = values.__meta;
    if (!rawMeta) return null;
    const meta = JSON.parse(rawMeta) as Omit<
      RoomSnapshot,
      "data" | "persistedRevision"
    > & { data: Record<string, unknown> };
    const elements: unknown[] = [];
    for (const [field, raw] of Object.entries(values)) {
      if (field.startsWith("element:")) elements.push(JSON.parse(String(raw)));
    }
    return {
      ...meta,
      data: { ...meta.data, elements },
      persistedRevision: Number(values.__persisted ?? 0),
    };
  }

  /** Warm a cold cache from the authoritative Prisma head without marking it dirty. */
  async warmSnapshot(
    sceneId: string,
    revision: number,
    data: Record<string, unknown> & { elements: unknown[] },
  ): Promise<boolean> {
    const elementFields: string[] = [];
    for (const item of data.elements) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof (item as { id?: unknown }).id !== "string"
      )
        continue;
      elementFields.push(
        `element:${(item as { id: string }).id}`,
        JSON.stringify(item),
      );
    }
    const now = Date.now();
    const meta = JSON.stringify({
      sceneId,
      revision,
      actorId: "",
      data: { ...data, elements: undefined },
      firstDirtyAt: now,
      lastDirtyAt: now,
    });
    const result = await this.redis.eval(
      `if redis.call('HEXISTS',KEYS[1],'__version')==1 then return 0 end
       redis.call('HSET',KEYS[1],'__version',ARGV[1],'__persisted',ARGV[1],'__meta',ARGV[2])
       local count=tonumber(ARGV[3])
       for i=4,3+(count*2),2 do redis.call('HSET',KEYS[1],ARGV[i],ARGV[i+1]) end
       return 1`,
      1,
      roomHashKey(sceneId),
      revision,
      meta,
      elementFields.length / 2,
      ...elementFields,
    );
    return Number(result) === 1;
  }

  /**
   * Atomic version check, O(k) delta HSET/HDEL patch (or full replace when
   * `delta` is omitted), and dirty-index update.
   */
  async writeSnapshot(
    sceneId: string,
    expectedRevision: number,
    revision: number,
    actorId: string,
    data: Record<string, unknown> & { elements: unknown[] },
    now = Date.now(),
    delta?: SnapshotDelta,
  ): Promise<boolean> {
    const key = roomHashKey(sceneId);
    const previousMeta = await this.readSnapshotMeta(sceneId);
    const firstDirtyAt =
      previousMeta && previousMeta.persistedRevision < previousMeta.revision
        ? previousMeta.firstDirtyAt
        : now;
    const meta = JSON.stringify({
      sceneId,
      revision,
      actorId,
      data: { ...data, elements: undefined },
      firstDirtyAt,
      lastDirtyAt: now,
    });

    const isDelta = delta !== undefined;
    const changedFields: string[] = [];
    const deletedFields: string[] = [];

    if (isDelta) {
      for (const [id, value] of Object.entries(delta.changedElements)) {
        if (!id) continue;
        changedFields.push(
          `element:${id}`,
          typeof value === "string" ? value : JSON.stringify(value),
        );
      }
      if (delta.deletedIds) {
        for (const id of delta.deletedIds) {
          if (!id) continue;
          deletedFields.push(`element:${id}`);
        }
      }
    } else {
      for (const item of data.elements) {
        if (
          !item ||
          typeof item !== "object" ||
          typeof (item as { id?: unknown }).id !== "string"
        )
          continue;
        changedFields.push(
          `element:${(item as { id: string }).id}`,
          JSON.stringify(item),
        );
      }
    }

    const result = await this.redis.eval(
      WRITE_SNAPSHOT_LUA,
      2,
      key,
      DIRTY_KEY,
      expectedRevision,
      revision,
      meta,
      isDelta ? 0 : 1,
      changedFields.length / 2,
      ...changedFields,
      deletedFields.length,
      ...deletedFields,
      now + ROOM_DEBOUNCE_MS,
      sceneId,
    );
    if (Number(result) !== 1) return false;
    await this.recordMessage(sceneId, now).catch((error: unknown) => {
      console.error("Room message metric update failed:", error);
    });
    await this.scheduleFlush(sceneId, now, false, {
      firstDirtyAt,
      lastDirtyAt: now,
    }).catch((error: unknown) => {
      // The atomic write added this room to the dirty index; the worker's
      // recovery scan will enqueue it after a queue outage.
      console.error("Room flush scheduling failed:", error);
    });
    await this.publish({
      type: "room.changed",
      sceneId,
      revision,
      origin: this.instanceId,
    }).catch((error: unknown) => {
      console.error("Room change broadcast failed:", error);
    });
    return true;
  }

  async recordMessage(sceneId: string, now = Date.now()): Promise<void> {
    if (!this.metricsEnabled) return;
    const bucket = Math.floor(now / 1000);
    const metricKey = `collab:metrics:${encodeURIComponent(sceneId)}:${bucket}`;
    await this.redis
      .multi()
      .incr(metricKey)
      .expire(metricKey, 5)
      .zadd(METRIC_ROOMS_KEY, now + 60_000, sceneId)
      .exec();
  }

  async scheduleFlush(
    sceneId: string,
    now = Date.now(),
    immediate = false,
    dirtyTimestamps?: { firstDirtyAt: number; lastDirtyAt: number },
  ): Promise<void> {
    const timestamps = dirtyTimestamps ?? (await this.readSnapshotMeta(sceneId));
    if (!timestamps) return;
    const dueAt = immediate
      ? now
      : Math.min(
          timestamps.lastDirtyAt + ROOM_DEBOUNCE_MS,
          timestamps.firstDirtyAt + ROOM_MAX_WAIT_MS,
        );
    // A fixed job ID coalesces updates. Replace only a delayed job so a running
    // worker cannot be removed; the dirty index remains the crash-recovery source.
    const jobId = `room-${createHash("sha256").update(sceneId).digest("hex")}`;
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (
        state === "delayed" ||
        state === "waiting" ||
        state === "failed" ||
        state === "completed" ||
        state === "prioritized"
      )
        await existing.remove().catch(() => undefined);
    }
    await this.queue
      .add(
        "flush",
        { sceneId },
        {
          jobId,
          delay: Math.max(0, dueAt - now),
          removeOnComplete: true,
          removeOnFail: 100,
          attempts: 10,
          backoff: { type: "exponential", delay: 500 },
        },
      )
      .catch(async (error: unknown) => {
        // An active job can own the fixed ID. It will read the latest snapshot;
        // the recovery scanner re-enqueues if it exits before covering it.
        if (!(await this.queue.getJob(jobId))) throw error;
      });
  }

  async dirtyRooms(limit = 100): Promise<string[]> {
    return this.redis.zrange(DIRTY_KEY, "0", String(limit - 1));
  }

  async roomMessageRates(
    now = Date.now(),
  ): Promise<{ sceneId: string; messagesPerSecond: number }[]> {
    const scenes = await this.redis.zrangebyscore(
      METRIC_ROOMS_KEY,
      now,
      "+inf",
    );
    const bucket = Math.floor(now / 1000);
    return Promise.all(
      scenes.map(async (sceneId) => {
        const keys = Array.from(
          { length: 10 },
          (_, index) =>
            `collab:metrics:${encodeURIComponent(sceneId)}:${bucket - index}`,
        );
        const counts = await this.redis.mget(...keys);
        const total = counts.reduce(
          (sum, count) => sum + Number(count ?? 0),
          0,
        );
        return { sceneId, messagesPerSecond: total / keys.length };
      }),
    );
  }

  async markPersisted(sceneId: string, revision: number): Promise<boolean> {
    const key = roomHashKey(sceneId);
    const result = await this.redis.eval(
      `local current=tonumber(redis.call('HGET',KEYS[1],'__version') or '0')
       local persisted=tonumber(redis.call('HGET',KEYS[1],'__persisted') or '0')
       local target=tonumber(ARGV[1])
       if target>persisted then redis.call('HSET',KEYS[1],'__persisted',target) end
       if current<=target then
         redis.call('ZREM',KEYS[2],ARGV[2])
         redis.call('ZREMRANGEBYSCORE',KEYS[3],'-inf',ARGV[4])
         if redis.call('ZCARD',KEYS[3])==0 then redis.call('EXPIRE',KEYS[1],ARGV[3]) end
       end
       return current`,
      3,
      key,
      DIRTY_KEY,
      roomConnectionsKey(sceneId),
      revision,
      sceneId,
      Math.ceil(ROOM_REDIS_GRACE_MS / 1000),
      Date.now(),
    );
    const current = Number(result);
    if (current > 0)
      await this.publish({
        type: "room.persisted",
        sceneId,
        revision,
        origin: this.instanceId,
      });
    return current <= revision;
  }

  async publish(event: Record<string, unknown>): Promise<void> {
    await this.redis.publish(EVENTS_CHANNEL, JSON.stringify(event));
  }

  /** Shared fixed-window limit with bounded, non-identifying Redis keys. */
  async consumeRateLimit(input: {
    bucket: string;
    subject: string;
    limit: number;
    windowMs: number;
  }): Promise<RateLimitResult> {
    const digest = createHash("sha256")
      .update(`${input.bucket}\0${input.subject}`)
      .digest("hex");
    const result = (await this.redis.eval(
      `local count=redis.call('INCR',KEYS[1])
       if count==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end
       local ttl=redis.call('PTTL',KEYS[1])
       return {count,ttl}`,
      1,
      `collab:rate-limit:${digest}`,
      Math.max(1, Math.floor(input.windowMs)),
    )) as [number, number];
    const count = Number(result[0]);
    const retryAfterMs = Math.max(0, Number(result[1]));
    return {
      allowed: count <= input.limit,
      remaining: Math.max(0, input.limit - count),
      retryAfterMs,
    };
  }

  async subscribe(
    handler: (event: Record<string, unknown>) => void,
  ): Promise<Redis> {
    const subscriber = this.redis.duplicate();
    await subscriber.subscribe(EVENTS_CHANNEL);
    subscriber.on("message", (_channel, raw) => {
      try {
        handler(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        /* Ignore malformed or obsolete events. */
      }
    });
    return subscriber;
  }

  async join(
    sceneId: string,
    connectionId: string,
    participant: { userId: string; displayName: string },
  ): Promise<void> {
    await this.redis
      .multi()
      .zadd(roomConnectionsKey(sceneId), Date.now() + 60_000, connectionId)
      .hset(
        roomParticipantsKey(sceneId),
        connectionId,
        JSON.stringify({ connectionId, ...participant }),
      )
      .persist(roomHashKey(sceneId))
      .exec();
  }

  async listParticipants(
    sceneId: string,
  ): Promise<{ connectionId: string; userId: string; displayName: string }[]> {
    const leases = roomConnectionsKey(sceneId);
    const expired = await this.redis.zrangebyscore(leases, "-inf", Date.now());
    if (expired.length > 0) {
      await this.redis
        .multi()
        .zrem(leases, ...expired)
        .hdel(roomParticipantsKey(sceneId), ...expired)
        .exec();
    }
    const values = await this.redis.hvals(roomParticipantsKey(sceneId));
    return values.flatMap((raw) => {
      try {
        const entry = JSON.parse(raw) as Record<string, unknown>;
        if (
          typeof entry.connectionId === "string" &&
          typeof entry.userId === "string" &&
          typeof entry.displayName === "string"
        ) {
          return [
            {
              connectionId: entry.connectionId,
              userId: entry.userId,
              displayName: entry.displayName,
            },
          ];
        }
      } catch {
        // Ignore malformed stale entries.
      }
      return [];
    });
  }

  async renew(sceneId: string, connectionId: string): Promise<void> {
    await this.redis.zadd(
      roomConnectionsKey(sceneId),
      Date.now() + 60_000,
      connectionId,
    );
    await this.redis.persist(roomHashKey(sceneId));
  }

  async leave(sceneId: string, connectionId: string): Promise<number> {
    const key = roomConnectionsKey(sceneId);
    await this.redis
      .multi()
      .zrem(key, connectionId)
      .hdel(roomParticipantsKey(sceneId), connectionId)
      .exec();
    const expired = await this.redis.zrangebyscore(key, "-inf", Date.now());
    if (expired.length > 0) {
      await this.redis
        .multi()
        .zrem(key, ...expired)
        .hdel(roomParticipantsKey(sceneId), ...expired)
        .exec();
    }
    const count = await this.redis.zcard(key);
    if (count === 0) {
      await this.redis.del(key, roomParticipantsKey(sceneId));
      await this.scheduleFlush(sceneId, Date.now(), true);
      const meta = await this.readSnapshotMeta(sceneId);
      if (meta && meta.persistedRevision >= meta.revision) {
        await this.redis.expire(
          roomHashKey(sceneId),
          Math.ceil(ROOM_REDIS_GRACE_MS / 1000),
        );
      }
    }
    return count;
  }

  /** Deep health probe for Redis with a bounded timeout. */
  async ping(timeoutMs = 2_000): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race<string | null>([
        this.redis.ping(),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        }),
      ]);
      return result === "PONG";
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Distributed idempotency claim using `SET collab:mut:<sceneId>:<mutationId> 1 EX 300 NX`.
   * Returns `true` if this replica claimed the mutation first, `false` if already seen.
   */
  async claimMutation(
    sceneId: string,
    mutationId: string,
    ttlSeconds = MUTATION_DEDUP_TTL_SECONDS,
  ): Promise<boolean> {
    const result = await this.redis.set(
      mutationKey(sceneId, mutationId),
      "1",
      "EX",
      ttlSeconds,
      "NX",
    );
    return result === "OK";
  }

  async getMutationResult<T = unknown>(
    sceneId: string,
    mutationId: string,
  ): Promise<T | null> {
    const raw = await this.redis.get(mutationResultKey(sceneId, mutationId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async storeMutationResult(
    sceneId: string,
    mutationId: string,
    result: unknown,
    ttlSeconds = MUTATION_DEDUP_TTL_SECONDS,
  ): Promise<void> {
    await this.redis
      .multi()
      .set(mutationKey(sceneId, mutationId), "1", "EX", ttlSeconds)
      .set(
        mutationResultKey(sceneId, mutationId),
        JSON.stringify(result),
        "EX",
        ttlSeconds,
      )
      .exec();
  }

  /** Per-room distributed lock so concurrent flush workers never race the same room. */
  async acquireFlushLock(
    sceneId: string,
    ttlMs = FLUSH_LOCK_TTL_MS,
  ): Promise<string | null> {
    const token = randomUUID();
    const res = await this.redis.set(
      flushLockKey(sceneId),
      token,
      "PX",
      ttlMs,
      "NX",
    );
    return res === "OK" ? token : null;
  }

  async releaseFlushLock(sceneId: string, token: string): Promise<void> {
    await this.redis.eval(RELEASE_LOCK_LUA, 1, flushLockKey(sceneId), token);
  }

  async startWorker(
    persist: (snapshot: RoomSnapshot) => Promise<void>,
    concurrency = 1,
  ): Promise<Worker> {
    const worker = new Worker(
      ROOM_FLUSH_QUEUE,
      async (job: Job<{ sceneId: string }>) => {
        const lockToken = await this.acquireFlushLock(job.data.sceneId);
        if (!lockToken) {
          // Another worker holds the flush lock for this room; re-schedule shortly.
          await this.scheduleFlush(job.data.sceneId, Date.now(), false);
          return;
        }
        try {
          const snapshot = await this.readSnapshot(job.data.sceneId);
          if (!snapshot || snapshot.revision <= snapshot.persistedRevision)
            return;
          const startedAt = Date.now();
          await persist(snapshot);
          await this.markPersisted(snapshot.sceneId, snapshot.revision);
          console.info(
            JSON.stringify({
              metric: "room_snapshot_flush",
              sceneId: snapshot.sceneId,
              revision: snapshot.revision,
              latencyMs: Date.now() - startedAt,
            }),
          );
        } finally {
          await this.releaseFlushLock(job.data.sceneId, lockToken).catch(
            () => undefined,
          );
        }
      },
      {
        // Let BullMQ own and close its connections. A supplied Redis instance
        // is treated as shared, leaving caller-created duplicates open.
        connection: {
          host: this.redis.options.host,
          port: this.redis.options.port,
          username: this.redis.options.username,
          password: this.redis.options.password,
          db: this.redis.options.db,
          tls: this.redis.options.tls,
          maxRetriesPerRequest: null,
        },
        concurrency,
        // BZPOPMIN wakes immediately for new jobs; this only reduces empty
        // queue polling. Delayed jobs still use their scheduled wake-up time.
        drainDelay: 60,
        stalledInterval: 60_000,
      },
    );
    return worker;
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.redis.quit();
  }
}

export function openRoomRedis(url = process.env.REDIS_URL): RoomRedis {
  return new RoomRedis(url);
}

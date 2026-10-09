import { createHash, randomUUID } from "node:crypto";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";

export const ROOM_FLUSH_QUEUE = "room-snapshot-flush";
export const ROOM_SNAPSHOT_KEEP = 20;
export const ROOM_DEBOUNCE_MS = 5_000;
export const ROOM_MAX_WAIT_MS = 30_000;
export const ROOM_REDIS_GRACE_MS = 60_000;

export interface RoomSnapshot {
  sceneId: string;
  revision: number;
  actorId: string;
  data: Record<string, unknown> & { elements: unknown[] };
  persistedRevision: number;
  firstDirtyAt: number;
  lastDirtyAt: number;
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
const DIRTY_KEY = "collab:dirty-rooms";
const METRIC_ROOMS_KEY = "collab:metric-rooms";
const EVENTS_CHANNEL = "collab:events";

/** Redis live snapshots and the write-behind queue share one configured Redis URL. */
export class RoomRedis {
  readonly redis: Redis;
  readonly queue: Queue;
  readonly instanceId = randomUUID();

  constructor(url = process.env.REDIS_URL) {
    if (!url) throw new Error("REDIS_URL must be configured.");
    this.redis = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.queue = new Queue(ROOM_FLUSH_QUEUE, {
      connection: this.redis.duplicate(),
    });
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
      ) continue;
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

  /** Atomic version check, snapshot replacement, and dirty-index update. */
  async writeSnapshot(
    sceneId: string,
    expectedRevision: number,
    revision: number,
    actorId: string,
    data: Record<string, unknown> & { elements: unknown[] },
    now = Date.now(),
  ): Promise<boolean> {
    const key = roomHashKey(sceneId);
    const previous = await this.readSnapshot(sceneId);
    const firstDirtyAt =
      previous && previous.persistedRevision < previous.revision
        ? previous.firstDirtyAt
        : now;
    const meta = JSON.stringify({
      sceneId,
      revision,
      actorId,
      data: { ...data, elements: undefined },
      firstDirtyAt,
      lastDirtyAt: now,
    });
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
    const result = await this.redis.eval(
      `local current=tonumber(redis.call('HGET',KEYS[1],'__version') or '0')
       if current~=tonumber(ARGV[1]) and current~=0 then return 0 end
       local old=redis.call('HKEYS',KEYS[1])
       for _,field in ipairs(old) do if string.sub(field,1,8)=='element:' then redis.call('HDEL',KEYS[1],field) end end
       redis.call('HSET',KEYS[1],'__version',ARGV[2],'__meta',ARGV[3])
       local count=tonumber(ARGV[4])
       for i=5,4+(count*2),2 do redis.call('HSET',KEYS[1],ARGV[i],ARGV[i+1]) end
       redis.call('ZADD',KEYS[2],ARGV[5+(count*2)],ARGV[6+(count*2)])
       return 1`,
      2,
      key,
      DIRTY_KEY,
      expectedRevision,
      revision,
      meta,
      elementFields.length / 2,
      ...elementFields,
      now + ROOM_DEBOUNCE_MS,
      sceneId,
    );
    if (Number(result) !== 1) return false;
    await this.recordMessage(sceneId, now).catch((error: unknown) => {
      console.error("Room message metric update failed:", error);
    });
    await this.scheduleFlush(sceneId, now).catch((error: unknown) => {
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
  ): Promise<void> {
    const snapshot = await this.readSnapshot(sceneId);
    if (!snapshot) return;
    const dueAt = immediate
      ? now
      : Math.min(
          snapshot.lastDirtyAt + ROOM_DEBOUNCE_MS,
          snapshot.firstDirtyAt + ROOM_MAX_WAIT_MS,
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
      const snapshot = await this.readSnapshot(sceneId);
      if (snapshot && snapshot.persistedRevision >= snapshot.revision) {
        await this.redis.expire(
          roomHashKey(sceneId),
          Math.ceil(ROOM_REDIS_GRACE_MS / 1000),
        );
      }
    }
    return count;
  }

  async startWorker(
    persist: (snapshot: RoomSnapshot) => Promise<void>,
    concurrency = 1,
  ): Promise<Worker> {
    const worker = new Worker(
      ROOM_FLUSH_QUEUE,
      async (job: Job<{ sceneId: string }>) => {
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
      },
      { connection: this.redis.duplicate(), concurrency },
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

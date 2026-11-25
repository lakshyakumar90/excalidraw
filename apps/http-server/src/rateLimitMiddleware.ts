import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { RoomRedis } from "@repo/redis";

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - windowMs)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retryAfter = windowMs
  if oldest and #oldest >= 2 then
    retryAfter = math.max(1, (tonumber(oldest[2]) + windowMs) - now)
  end
  return {0, 0, retryAfter}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs + 1000)
return {1, limit - count - 1, 0}
`;

export interface SlidingRateLimitOptions {
  bucket: string;
  limit: number;
  windowMs: number;
}

let sharedRedis: RoomRedis | null = null;
const memoryWindows = new Map<string, number[]>();

export function configureGlobalRateLimiter(redis: RoomRedis | null): void {
  sharedRedis = redis;
}

export function resetInMemoryRateLimits(): void {
  memoryWindows.clear();
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function checkMemorySlidingWindow(
  key: string,
  now: number,
  windowMs: number,
  limit: number,
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const cutoff = now - windowMs;
  const timestamps = (memoryWindows.get(key) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= limit) {
    const retryAfterMs = Math.max(1, (timestamps[0]! + windowMs) - now);
    memoryWindows.set(key, timestamps);
    return { allowed: false, remaining: 0, retryAfterMs };
  }
  timestamps.push(now);
  memoryWindows.set(key, timestamps);
  return {
    allowed: true,
    remaining: Math.max(0, limit - timestamps.length),
    retryAfterMs: 0,
  };
}

/**
 * Redis-backed sliding-window HTTP rate limiter with automatic in-memory fallback.
 */
export function createSlidingWindowRateLimiter(options: SlidingRateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Health probes should never be rate-limited.
    if (req.path === "/health") {
      next();
      return;
    }

    const ip = getClientIp(req);
    const digest = createHash("sha256")
      .update(`${options.bucket}\0${ip}`)
      .digest("hex");
    const redisKey = `http:rl:${options.bucket}:${digest}`;
    const now = Date.now();

    let result: { allowed: boolean; remaining: number; retryAfterMs: number };

    if (sharedRedis) {
      try {
        const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
        const raw = (await sharedRedis.redis.eval(
          SLIDING_WINDOW_LUA,
          1,
          redisKey,
          now,
          options.windowMs,
          options.limit,
          member,
        )) as [number, number, number];
        result = {
          allowed: Number(raw[0]) === 1,
          remaining: Math.max(0, Number(raw[1])),
          retryAfterMs: Math.max(0, Number(raw[2])),
        };
      } catch {
        result = checkMemorySlidingWindow(
          redisKey,
          now,
          options.windowMs,
          options.limit,
        );
      }
    } else {
      result = checkMemorySlidingWindow(
        redisKey,
        now,
        options.windowMs,
        options.limit,
      );
    }

    res.setHeader("X-RateLimit-Limit", String(options.limit));
    res.setHeader("X-RateLimit-Remaining", String(result.remaining));

    if (!result.allowed) {
      const retrySec = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
      res.setHeader("Retry-After", String(retrySec));
      res.status(429).json({
        error: "Too Many Requests",
        retryAfterSeconds: retrySec,
      });
      return;
    }

    next();
  };
}

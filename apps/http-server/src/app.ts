import express, { type Express } from "express";
import cors from "cors";
import { authHandler, authWebOrigin } from "@repo/auth";
import { pingDatabase } from "@repo/db";
import { requireAuth } from "./middleware.js";
import { createSlidingWindowRateLimiter } from "./rateLimitMiddleware.js";
import { scenesRouter } from "./routes/scenes.js";
import { roomsRouter } from "./routes/rooms.js";
import { libraryRouter } from "./routes/library.js";
import { filesRouter } from "./routes/files.js";
import { revisionsRouter } from "./routes/revisions.js";

export interface HealthProbeConfig {
  pingDb?: () => Promise<boolean>;
  pingRedis?: () => Promise<boolean>;
}

let healthProbeConfig: HealthProbeConfig = {
  pingDb: () => pingDatabase(2_000),
};

export function configureHealthChecks(config: HealthProbeConfig): void {
  healthProbeConfig = { ...healthProbeConfig, ...config };
}

export const app: Express = express();

app.use(
  cors({
    origin: authWebOrigin,
    credentials: true,
  }),
);

// Global sliding-window HTTP rate limiter (120 req/min per IP)
app.use(
  createSlidingWindowRateLimiter({
    bucket: "global",
    limit: 120,
    windowMs: 60_000,
  }),
);

// Stricter rate limit on auth routes (30 req/min per IP)
const authRateLimiter = createSlidingWindowRateLimiter({
  bucket: "auth",
  limit: 30,
  windowMs: 60_000,
});

// Better Auth must receive the raw request body, so mount it before express.json().
app.all("/api/auth", authRateLimiter, authHandler);
app.all("/api/auth/*splat", authRateLimiter, authHandler);

// Lowered from 50mb to 2mb now that binary image blobs upload via presigned S3/R2 URLs.
app.use(express.json({ limit: "2mb" }));

app.get("/health", async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([
    healthProbeConfig.pingDb
      ? healthProbeConfig.pingDb().catch(() => false)
      : Promise.resolve(true),
    healthProbeConfig.pingRedis
      ? healthProbeConfig.pingRedis().catch(() => false)
      : Promise.resolve(true),
  ]);
  const healthy = dbOk && redisOk;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    service: "http",
    checks: {
      postgres: healthProbeConfig.pingDb ? (dbOk ? "ok" : "error") : "skipped",
      redis: healthProbeConfig.pingRedis
        ? redisOk
          ? "ok"
          : "error"
        : "skipped",
    },
  });
});

app.get("/me", requireAuth, (req, res) => {
  res.json({ userId: req.userId });
});

app.use("/api/files", requireAuth, filesRouter);
app.use("/api/revisions", requireAuth, revisionsRouter);
app.use("/scenes", requireAuth, scenesRouter);
app.use("/library", requireAuth, libraryRouter);

app.use("/room", requireAuth, roomsRouter);

import express, { type Express } from "express";
import cors from "cors";
import { authHandler, authWebOrigin } from "@repo/auth";
import { pingDatabase } from "@repo/db";
import { requireAuth } from "./middleware.js";
import { scenesRouter } from "./routes/scenes.js";
import { roomsRouter } from "./routes/rooms.js";
import { libraryRouter } from "./routes/library.js";

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

// Better Auth must receive the raw request body, so mount it before express.json().
app.all("/api/auth", authHandler);
app.all("/api/auth/*splat", authHandler);
app.use(express.json({ limit: "50mb" }));

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

app.use("/scenes", requireAuth, scenesRouter);
app.use("/library", requireAuth, libraryRouter);

app.use("/room", requireAuth, roomsRouter);

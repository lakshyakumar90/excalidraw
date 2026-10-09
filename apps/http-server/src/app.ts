import express, { type Express } from "express";
import cors from "cors";
import { authHandler, authWebOrigin } from "@repo/auth";
import { requireAuth } from "./middleware.js";
import { scenesRouter } from "./routes/scenes.js";
import { roomsRouter } from "./routes/rooms.js";

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

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/me", requireAuth, (req, res) => {
  res.json({ userId: req.userId });
});

app.use("/scenes", requireAuth, scenesRouter);

app.use("/room", requireAuth, roomsRouter);

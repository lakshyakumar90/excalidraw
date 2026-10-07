import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { RoomSchema } from "@repo/validations";
import { db } from "@repo/db";
import { auth, authPool, authWebOrigin } from "./auth.js";
import { requireAuth } from "./middleware.js";
import { scenesRouter } from "./scenes.js";

const app = express();

app.use(
  cors({
    origin: authWebOrigin,
    credentials: true,
  }),
);

// Better Auth must receive the raw request body, so mount it before express.json().
app.all("/api/auth", toNodeHandler(auth));
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json({ limit: "50mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/me", requireAuth, (req, res) => {
  res.json({ userId: req.userId });
});

app.use("/scenes", requireAuth, scenesRouter);

app.post("/room", requireAuth, async (req, res) => {
  try {
    const result = RoomSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json(result.error);
    }

    const room = await db.orm?.public?.Room.create({
      slug: result.data.name,
      adminId: req.userId!,
    });

    if (!room) {
      return res.status(500).json({ message: "Failed to create room" });
    }

    return res.json({
      message: "Room created successfully",
      roomId: room.id,
    });
  } catch (error) {
    console.error("Room creation error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

async function startServer() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Set BETTER_AUTH_SECRET to a random value of at least 32 characters.");
  }

  try {
    await Promise.all([db.connect(), authPool.query("SELECT 1")]);

    const port = Number(process.env.PORT ?? 5000);
    app.listen(port, () => {
      console.log(`HTTP server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to connect to the database:", error);
    process.exit(1);
  }
}

void startServer();

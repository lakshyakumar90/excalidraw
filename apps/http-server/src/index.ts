import express from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common";
import { middleware } from "./middleware.js";
import { CreateUserSchema, SigninSchema, RoomSchema } from "@repo/validations";
import { db } from "@repo/db";
import bcrypt from "bcrypt";

const app = express();
app.use(express.json());

app.post("/signup", async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ message: "Request body is required" });
    }

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const result = CreateUserSchema.safeParse({ name, email, password });

    if (!result.success) {
      return res.status(400).json(result.error);
    }

    const existingUser = await db.orm?.public?.User
          .select("id", "email", "name")
          .where({ email: result.data.email })
          .first();

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await db.orm?.public?.User
          .select("id", "email", "name")
          .create({
            name: result.data.name,
            email: result.data.email,
            password: hashedPassword,
          });

    res.json({
      message: "User registered successfully",
      userId: user?.id,
    });
  } catch (e) {
    console.error("Signup error:", e);
    res.status(500).json({
      message: "Internal server error",
      error: e instanceof Error ? e.message : String(e)
    });
  }
});

app.post("/signin", (req, res) => {
  const { email, password } = req.body;
  const result = SigninSchema.safeParse({ email, password });

  if (!result.success) {
    return res.status(400).json(result.error);
  }

  const userId = "123";
  const token = jwt.sign(
    {
      userId,
    },
    JWT_SECRET,
  );

  res.json({
    token,
  });
});

app.post("/room", middleware, (req, res) => {
  const { name } = req.body;
  const result = RoomSchema.safeParse({ name });

  if (!result.success) {
    return res.status(400).json(result.error);
  }

  res.json({
    message: "Room created successfully",
    roomId: "123",
  });
});

async function startServer() {
  try {
    await db.connect();
    console.log("✅ Database driver connected successfully.");

    app.listen(process.env.PORT || 5000, () => {
      console.log(`🚀 Server is running on port ${process.env.PORT || 5000}`);
    });
  } catch (error) {
    console.error("❌ Failed to connect to the database:", error);
    process.exit(1);
  }
}

startServer();

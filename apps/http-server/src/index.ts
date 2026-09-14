import express from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { JWT_SECRET } from "@repo/backend-common";
import { middleware } from "./middleware.js";
import { CreateUserSchema, SigninSchema, RoomSchema } from "@repo/validations";

const app = express();

app.post("/signup", (req, res) => {
  const { name, email, password } = req.body;
  const result = CreateUserSchema.safeParse({ name, email, password });

  if (!result.success) {
    return res.status(400).json(result.error);
  }

  res.json({
    message: "User registered successfully",
    userId: "123",
  });
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

app.listen(process.env.PORT || 5000, () => {
  console.log(`Server is running on port ${process.env.PORT || 5000}`);
});

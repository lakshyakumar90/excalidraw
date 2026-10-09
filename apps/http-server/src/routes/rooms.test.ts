import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { db } from "@repo/db";
import { roomsRouter } from "./rooms.js";

test("room ownership and invitation email are enforced", async () => {
  const ormDescriptor = Object.getOwnPropertyDescriptor(db, "orm");
  const transactionDescriptor = Object.getOwnPropertyDescriptor(
    db,
    "transaction",
  );
  const orm = {
    public: {
      Room: {
        where: ({ id, adminId }: { id?: number; adminId?: string }) => ({
          first: async () =>
            id === 1 && (adminId === undefined || adminId === "alice")
              ? { id: 1, adminId: "alice", slug: "Private", sceneId: "scene-1" }
              : null,
        }),
      },
      RoomMember: { where: () => ({ first: async () => null }) },
      Scene: { where: () => ({ first: async () => null }) },
      Invite: {
        where: () => ({ first: async () => null }),
        create: async () => ({}),
      },
      User: { where: () => ({ first: async () => null }) },
    },
  };
  Object.defineProperty(db, "orm", { configurable: true, value: orm });
  Object.defineProperty(db, "transaction", {
    configurable: true,
    value: async (callback: (tx: { orm: typeof orm }) => Promise<unknown>) =>
      callback({ orm }),
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = req.header("x-user") ?? "bob";
    next();
  });
  app.use("/room", roomsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(`${base}/room/1`)).status, 404);
    const invite = (user: string) =>
      fetch(`${base}/room/1/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user": user },
        body: JSON.stringify({ email: "friend@example.com" }),
      });
    assert.equal((await invite("bob")).status, 404);
    assert.equal(
      (
        await fetch(`${base}/room`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Private",
            sceneId: "someone-elses-scene",
          }),
        })
      ).status,
      404,
    );
    const created = await invite("alice");
    assert.equal(created.status, 201);
    const { code } = (await created.json()) as { code: string };
    assert.match(code, /^[a-f0-9]{64}$/);
    assert.equal(
      (await fetch(`${base}/room/invites/${code}/accept`, { method: "POST" }))
        .status,
      404,
    );
    assert.equal(
      (
        await fetch(`${base}/room/1/scene`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { elements: [] } }),
        })
      ).status,
      404,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (ormDescriptor) Object.defineProperty(db, "orm", ormDescriptor);
    else Reflect.deleteProperty(db, "orm");
    if (transactionDescriptor)
      Object.defineProperty(db, "transaction", transactionDescriptor);
    else Reflect.deleteProperty(db, "transaction");
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { db } from "@repo/db";
import { configureInvitationRateLimiter } from "../invitationRateLimit.js";
import { roomsRouter } from "./rooms.js";

test("owners manage rooms; members can leave only themselves", async () => {
  const descriptors = {
    orm: Object.getOwnPropertyDescriptor(db, "orm"),
    transaction: Object.getOwnPropertyDescriptor(db, "transaction"),
  };
  let room: Record<string, unknown> | null = {
    id: 1,
    adminId: "owner",
    slug: "Test",
    sceneId: "saved-scene",
  };
  const members: Record<string, unknown>[] = [
    { id: 1, roomId: 1, userId: "owner", role: "owner" },
    { id: 2, roomId: 1, userId: "editor", role: "editor" },
    { id: 3, roomId: 1, userId: "viewer", role: "viewer" },
  ];
  const notified: string[] = [];
  configureInvitationRateLimiter({
    consumeRateLimit: async () => ({
      allowed: true,
      remaining: 100,
      retryAfterMs: 0,
    }),
    publish: async (event) => {
      notified.push(String(event.userId));
    },
  });
  const matches = (
    row: Record<string, unknown>,
    criteria: Record<string, unknown>,
  ) => Object.entries(criteria).every(([key, value]) => row[key] === value);
  const orm = {
    public: {
      Room: {
        where: (criteria: Record<string, unknown>) => ({
          first: async () => (room && matches(room, criteria) ? room : null),
          delete: async () => {
            if (room && matches(room, criteria)) room = null;
          },
        }),
      },
      RoomMember: {
        where: (criteria: Record<string, unknown>) => ({
          first: async () =>
            members.find((member) => matches(member, criteria)) ?? null,
          delete: async () => {
            const index = members.findIndex((member) =>
              matches(member, criteria),
            );
            if (index !== -1) members.splice(index, 1);
          },
        }),
      },
    },
  };
  Object.defineProperty(db, "orm", { configurable: true, value: orm });
  Object.defineProperty(db, "transaction", {
    configurable: true,
    value: async (callback: (tx: { orm: typeof orm }) => unknown) =>
      callback({ orm }),
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = req.header("x-user") ?? "outsider";
    next();
  });
  app.use("/room", roomsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/room/1`;
  const request = (path: string, user: string, method = "POST") =>
    fetch(base + path, { method, headers: { "x-user": user } });
  try {
    assert.equal((await request("", "editor", "DELETE")).status, 404);
    assert.equal(
      (await request("/members/viewer", "editor", "DELETE")).status,
      404,
    );
    assert.equal((await request("/leave", "owner")).status, 409);
    assert.equal((await request("/leave", "outsider")).status, 404);
    assert.equal((await request("/leave", "viewer")).status, 204);
    assert.equal(
      members.some((member) => member.userId === "viewer"),
      false,
    );
    assert.equal(
      members.some((member) => member.userId === "editor"),
      true,
    );
    assert.equal((await request("/leave", "viewer")).status, 404);
    assert.equal(
      (await request("/members/owner", "owner", "DELETE")).status,
      404,
    );
    assert.equal(
      (await request("/members/editor", "owner", "DELETE")).status,
      204,
    );
    assert.deepEqual(notified, ["viewer", "editor"]);
    assert.equal((await request("", "owner", "DELETE")).status, 204);
    assert.equal(room, null);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const key of ["orm", "transaction"] as const) {
      if (descriptors[key]) Object.defineProperty(db, key, descriptors[key]!);
      else Reflect.deleteProperty(db, key);
    }
  }
});

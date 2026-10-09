import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { authPool } from "../database.js";
import { roomsRouter } from "./rooms.js";

test("room endpoints reject unrelated users and do not accept an invitation for another email", async () => {
  const queryDescriptor = Object.getOwnPropertyDescriptor(authPool, "query");
  const connectDescriptor = Object.getOwnPropertyDescriptor(
    authPool,
    "connect",
  );
  Object.defineProperty(authPool, "query", {
    configurable: true,
    value: async (sql: string, values: unknown[]) => {
      if (sql.includes('UPDATE "scene"')) return { rowCount: 0, rows: [] };
      if (sql.includes('SELECT "id" FROM "room"'))
        return {
          rowCount: values[1] === "alice" ? 1 : 0,
          rows: values[1] === "alice" ? [{ id: 1 }] : [],
        };
      return { rowCount: 0, rows: [] };
    },
  });
  Object.defineProperty(authPool, "connect", {
    configurable: true,
    value: async () => ({
      query: async (sql: string) => {
        if (sql.includes('SELECT i."id"')) return { rowCount: 0, rows: [] };
        return { rowCount: 0, rows: [] };
      },
      release: () => {},
    }),
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
    const create = await fetch(`${base}/room`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Private room",
        sceneId: "another-users-scene",
      }),
    });
    assert.equal(create.status, 404);
    const created = await invite("alice");
    assert.equal(created.status, 201);
    const { code } = (await created.json()) as { code: string };
    assert.match(code, /^[a-f0-9]{64}$/);
    assert.equal(
      (await fetch(`${base}/room/invites/${code}/accept`, { method: "POST" }))
        .status,
      404,
    );
    const update = await fetch(`${base}/room/1/scene`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { elements: [] } }),
    });
    assert.equal(update.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (queryDescriptor)
      Object.defineProperty(authPool, "query", queryDescriptor);
    else Reflect.deleteProperty(authPool, "query");
    if (connectDescriptor)
      Object.defineProperty(authPool, "connect", connectDescriptor);
    else Reflect.deleteProperty(authPool, "connect");
  }
});

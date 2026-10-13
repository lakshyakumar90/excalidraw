import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { db } from "@repo/db";
import { scenesRouter } from "./scenes.js";

test("saved scene discovers its room without allowing another user to read it", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(db, "orm");
  let attached = true;
  let failLookup = false;
  const scene = { id: "drawing", ownerId: "owner", title: "Drawing", data: { elements: [] } };
  Object.defineProperty(db, "orm", {
    configurable: true,
    value: { public: {
      Scene: { where: (filter: { ownerId?: string }) => ({ first: async () => !filter.ownerId || filter.ownerId === "owner" ? scene : null }) },
      Room: { where: () => ({ first: async () => {
        if (failLookup) throw new Error("Room lookup unavailable");
        return attached ? { id: 42 } : null;
      } }) },
      SceneRevision: { where: () => ({ orderBy: () => ({ first: async () => null }) }) },
    } },
  });
  const app = express();
  app.use((req, _res, next) => { req.userId = req.header("x-user") ?? "owner"; next(); });
  app.use("/scenes", scenesRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/scenes/drawing`;
  try {
    const linked = await fetch(url);
    assert.equal(linked.status, 200);
    assert.equal((await linked.json() as { scene: { roomId: number } }).scene.roomId, 42);
    const forbidden = await fetch(url, { headers: { "x-user": "stranger" } });
    assert.equal(forbidden.status, 404);
    attached = false;
    assert.equal((await (await fetch(url)).json() as { scene: { roomId: null } }).scene.roomId, null);
    failLookup = true;
    // Do not silently fall back to private autosave when room discovery fails.
    assert.equal((await fetch(url)).status, 500);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (descriptor) Object.defineProperty(db, "orm", descriptor);
    else Reflect.deleteProperty(db, "orm");
  }
});

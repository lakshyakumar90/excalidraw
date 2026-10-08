import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { db } from "@repo/db";
import { guestImportRouter } from "./guestImport.js";

test("guest imports preserve data and are idempotent and account-specific", async () => {
  const rows = new Map<string, Record<string, unknown>>();
  const descriptor = Object.getOwnPropertyDescriptor(db, "orm");
  Object.defineProperty(db, "orm", {
    configurable: true,
    value: {
      public: {
        Scene: {
          where: ({ id, ownerId }: { id: string; ownerId: string }) => ({
            first: async () => {
              const row = rows.get(id);
              return row?.ownerId === ownerId ? row : null;
            },
          }),
          create: async (row: Record<string, unknown>) => {
            const id = row.id as string;
            if (rows.has(id)) throw new Error("Duplicate primary key");
            rows.set(id, structuredClone(row));
            return row;
          },
        },
      },
    },
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = req.header("x-test-user") ?? "alice";
    next();
  });
  app.use("/", guestImportRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const key = "a".repeat(64);
  const data = {
    elements: [{ id: "image-1", type: "image", fileId: "file-1" }],
    appState: { scrollX: 35, scrollY: -20, zoom: { value: 1.5 } },
    files: {
      "file-1": {
        id: "file-1",
        dataURL: "data:image/png;base64,AA==",
        mimeType: "image/png",
        created: 1,
      },
    },
  };
  const save = (user = "alice") =>
    fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": user },
      body: JSON.stringify({ importKey: key, title: "Guest drawing", data }),
    });
  try {
    assert.deepEqual(await (await fetch(`${base}/${key}`)).json(), {
      scene: null,
    });
    const responses = await Promise.all([save(), save()]);
    assert(responses.every((response) => response.ok));
    const first = (await responses[0]!.json()).scene;
    const second = (await responses[1]!.json()).scene;
    assert.equal(first.id, second.id);
    assert.equal(rows.size, 1);
    assert.deepEqual(first.data, data);
    // An edited account drawing must not be overwritten by a retry.
    rows.get(first.id)!.title = "Renamed drawing";
    assert.equal((await (await save()).json()).scene.title, "Renamed drawing");
    const bob = (await (await save("bob")).json()).scene;
    assert.notEqual(first.id, bob.id);
    assert.equal(rows.size, 2);
    assert.equal((await fetch(`${base}/invalid`)).status, 400);
    const invalid = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (descriptor) Object.defineProperty(db, "orm", descriptor);
    else Reflect.deleteProperty(db, "orm");
  }
});

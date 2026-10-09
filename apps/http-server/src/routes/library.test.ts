import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { createLibraryRouter, type LibraryRepository } from "./library.js";

test("personal library CRUD always uses the session owner and rejects invalid stamps", async () => {
  const records = new Map<
    string,
    {
      id: string;
      ownerId: string;
      name: string;
      data: unknown;
      updatedAt: string;
    }
  >();
  let counter = 0;
  const repository: LibraryRepository = {
    list: async (ownerId) =>
      [...records.values()].filter((i) => i.ownerId === ownerId),
    get: async (ownerId, id) =>
      records.get(id)?.ownerId === ownerId ? records.get(id)! : null,
    create: async (ownerId, name, data) => {
      const item = {
        id: String(++counter),
        ownerId,
        name,
        data,
        updatedAt: new Date().toISOString(),
      };
      records.set(item.id, item);
      return item;
    },
    rename: async (ownerId, id, name) => {
      if (records.get(id)?.ownerId === ownerId) records.get(id)!.name = name;
    },
    remove: async (ownerId, id) => {
      if (records.get(id)?.ownerId === ownerId) records.delete(id);
    },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = req.header("x-user") ?? "alice";
    next();
  });
  app.use("/library", createLibraryRouter(repository));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/library`;
  const request = (
    path: string,
    method = "GET",
    user = "alice",
    body?: unknown,
  ) =>
    fetch(base + path, {
      method,
      headers: { "x-user": user, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  try {
    const data = {
      version: 1,
      elements: [
        {
          id: "shape",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          version: 1,
          versionNonce: 1,
        },
      ],
      files: {},
    };
    const created = await request("", "POST", "alice", {
      name: "Stamp",
      data,
      ownerId: "bob",
    });
    assert.equal(created.status, 201);
    const { item } = (await created.json()) as { item: { id: string } };
    assert.equal(records.get(item.id)?.ownerId, "alice");
    for (const method of ["GET", "PATCH", "DELETE"]) {
      assert.equal(
        (
          await request(
            `/${item.id}`,
            method,
            "bob",
            method === "PATCH" ? { name: "Hijacked" } : undefined,
          )
        ).status,
        404,
      );
    }
    assert.deepEqual(
      ((await (await request("", "GET", "bob")).json()) as { items: unknown[] })
        .items,
      [],
    );
    assert.equal(
      (
        await request("", "POST", "alice", {
          name: "Broken",
          data: {
            ...data,
            elements: [{ ...data.elements[0], frameId: "missing" }],
          },
        })
      ).status,
      400,
    );
    assert.equal(
      (await request(`/${item.id}`, "PATCH", "alice", { name: "Renamed" }))
        .status,
      200,
    );
    assert.equal(records.get(item.id)?.name, "Renamed");
    assert.equal((await request(`/${item.id}`, "DELETE")).status, 204);
    assert.equal(records.size, 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

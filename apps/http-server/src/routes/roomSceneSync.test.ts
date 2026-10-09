import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { db } from "@repo/db";
import { roomsRouter } from "./rooms.js";

function rect(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    version: 2,
    versionNonce: 2,
    ...overrides,
  };
}

function collection(initial: Record<string, unknown>[] = []) {
  const rows = initial.map((row) => ({ ...row }));
  const matches = (filter: Record<string, unknown>) =>
    rows.filter((row) =>
      Object.entries(filter ?? {}).every(([key, value]) => row[key] === value),
    );
  return {
    rows,
    where: (filter: Record<string, unknown>) => {
      const found = matches(filter);
      return {
        first: async () =>
          found.length > 0 ? structuredClone(found[0]) : null,
        all: async () => found.map((row) => structuredClone(row)),
        select: (...fields: string[]) => {
          const project = (row: Record<string, unknown>) =>
            Object.fromEntries(fields.map((field) => [field, row[field]]));
          return {
            all: async () => found.map(project),
            first: async () =>
              found.length > 0 ? project(found[0]!) : null,
          };
        },
        orderBy: (_order: unknown) => ({
          first: async () => {
            const sorted = [...found].sort(
              (a, b) =>
                ((b.revision ?? 0) as number) - ((a.revision ?? 0) as number),
            );
            return sorted.length > 0 ? structuredClone(sorted[0]) : null;
          },
        }),
        update: async (patch: Record<string, unknown>) => {
          const target = rows.find((row) =>
            Object.entries(filter).every(([key, value]) => row[key] === value),
          );
          if (!target) return null;
          Object.assign(target, structuredClone(patch));
          return structuredClone(target);
        },
        delete: async () => {
          const index = rows.findIndex((row) =>
            Object.entries(filter).every(([key, value]) => row[key] === value),
          );
          if (index === -1) return null;
          const [removed] = rows.splice(index, 1);
          return removed;
        },
      };
    },
    create: async (row: Record<string, unknown>) => {
      if (
        "sceneId" in row &&
        "revision" in row &&
        rows.some(
          (existing) =>
            existing.sceneId === row.sceneId &&
            existing.revision === row.revision,
        )
      ) {
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      }
      const created = { id: rows.length + 1, ...structuredClone(row) };
      rows.push(created);
      return structuredClone(created);
    },
  };
}

async function withRoomStack(
  run: (base: string) => Promise<void>,
): Promise<void> {
  const ormDescriptor = Object.getOwnPropertyDescriptor(db, "orm");
  const rooms = collection([
    { id: 1, slug: "Studio", adminId: "alice", sceneId: "scene-1" },
  ]);
  const scenes = collection([
    {
      id: "scene-1",
      ownerId: "alice",
      title: "Studio scene",
      data: { elements: [], sync: { revision: 0, tombstones: {} } },
    },
  ]);
  const members = collection([
    { id: 2, userId: "carol", roomId: 1, role: "editor" },
  ]);
  const revisions = collection([]);
  const users = collection([
    { id: "alice", name: "Alice" },
    { id: "carol", name: "Carol" },
  ]);
  Object.defineProperty(db, "orm", {
    configurable: true,
    value: {
      public: {
        Room: rooms,
        Scene: scenes,
        RoomMember: members,
        SceneRevision: revisions,
        User: users,
        Invite: { where: () => ({ first: async () => null }) },
      },
    },
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
    await run(base);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (ormDescriptor) Object.defineProperty(db, "orm", ormDescriptor);
    else Reflect.deleteProperty(db, "orm");
  }
}

const patchScene = (base: string, user: string, data: unknown) =>
  fetch(`${base}/room/1/scene`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-user": user },
    body: JSON.stringify({ data }),
  });

test("room scene PATCH merges concurrent writers instead of overwriting", async () => {
  await withRoomStack(async (base) => {
    const first = await patchScene(base, "alice", {
      elements: [rect("a", { versionNonce: 5 })],
    });
    assert.equal(first.status, 200);
    assert.equal(((await first.json()) as { revision: number }).revision, 1);

    const second = await patchScene(base, "carol", {
      elements: [rect("b", { versionNonce: 6 })],
    });
    assert.equal(second.status, 200);

    const room = (await (
      await fetch(`${base}/room/1`, { headers: { "x-user": "alice" } })
    ).json()) as { scene: { data: { elements: { id: string }[] } } };
    assert.deepEqual(
      room.scene.data.elements.map((element) => element.id).sort(),
      ["a", "b"],
    );

    // A stale same-element edit loses deterministically without erasing.
    const stale = await patchScene(base, "carol", {
      elements: [rect("a", { version: 1, versionNonce: 1, x: 999 })],
    });
    assert.equal(stale.status, 200);
    const after = (await (
      await fetch(`${base}/room/1`, { headers: { "x-user": "alice" } })
    ).json()) as { scene: { data: { elements: { id: string; x: number }[] } } };
    const kept = after.scene.data.elements.find((element) => element.id === "a");
    assert.notEqual(kept?.x, 999);
  });
});

test("room scene PATCH keeps viewer and validation behavior", async () => {
  await withRoomStack(async (base) => {
    assert.equal(
      (await patchScene(base, "bob", { elements: [rect("a")] })).status,
      404,
    );
    assert.equal(
      (await patchScene(base, "alice", { elements: "nope" })).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${base}/room/1/scene`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-user": "alice" },
          body: JSON.stringify({ title: "New" }),
        })
      ).status,
      400,
    );
  });
});

test("room image files upload before the referencing commit saves", async () => {
  await withRoomStack(async (base) => {
    const image = {
      id: "img1",
      type: "image",
      x: 0,
      y: 0,
      fileId: "file-9",
      version: 2,
      versionNonce: 2,
    };
    const blocked = await patchScene(base, "alice", { elements: [image] });
    assert.equal(blocked.status, 409);
    assert.deepEqual(
      ((await blocked.json()) as { missingFiles: string[] }).missingFiles,
      ["file-9"],
    );

    const upload = await fetch(`${base}/room/1/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user": "alice" },
      body: JSON.stringify({
        fileId: "file-9",
        file: {
          id: "file-9",
          mimeType: "image/png",
          dataURL: "data:image/png;base64,AAA",
          created: 1,
        },
      }),
    });
    assert.equal(upload.status, 200);

    const saved = await patchScene(base, "alice", { elements: [image] });
    assert.equal(saved.status, 200);

    const fetched = await fetch(`${base}/room/1/files/file-9`, {
      headers: { "x-user": "carol" },
    });
    assert.equal(fetched.status, 200);
    assert.equal(
      ((await fetched.json()) as { file: { mimeType: string } }).file.mimeType,
      "image/png",
    );
    assert.equal(
      (await fetch(`${base}/room/1/files/missing`, { headers: { "x-user": "carol" } }))
        .status,
      404,
    );
    assert.equal(
      (
        await fetch(`${base}/room/1/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user": "bob" },
          body: JSON.stringify({ fileId: "x", file: {} }),
        })
      ).status,
      404,
    );
  });
});

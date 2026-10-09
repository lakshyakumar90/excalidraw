import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { verifyPresenceTicket } from "@repo/auth";
import { db } from "@repo/db";
import { roomsRouter } from "./rooms.js";

test("presence tickets require room access and stay room-scoped", async () => {
  process.env.PRESENCE_TICKET_SECRET =
    "test-presence-ticket-secret-at-least-32-chars";
  const ormDescriptor = Object.getOwnPropertyDescriptor(db, "orm");
  const members = new Map<string, { role: string }>([
    ["1:carol", { role: "editor" }],
  ]);
  Object.defineProperty(db, "orm", {
    configurable: true,
    value: {
      public: {
        Room: {
          where: ({ id, adminId }: { id?: number; adminId?: string }) => ({
            first: async () =>
              id === 1 && (adminId === undefined || adminId === "alice")
                ? { id: 1, adminId: "alice", slug: "Studio", sceneId: "scene-1" }
                : null,
          }),
        },
        RoomMember: {
          where: ({ roomId, userId }: { roomId?: number; userId?: string }) => ({
            first: async () => {
              const member = members.get(`${roomId}:${userId}`);
              return member ? { roomId, userId, role: member.role } : null;
            },
          }),
        },
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
  const ticketFor = (user: string, room: string) =>
    fetch(`${base}/room/${room}/presence-ticket`, {
      method: "POST",
      headers: { "x-user": user },
    });
  try {
    // A nonmember learns nothing beyond "not found".
    assert.equal((await ticketFor("bob", "1")).status, 404);
    // Unknown and malformed room IDs behave like missing rooms.
    assert.equal((await ticketFor("alice", "999")).status, 404);
    assert.equal((await ticketFor("alice", "abc")).status, 404);

    const ownerResponse = await ticketFor("alice", "1");
    assert.equal(ownerResponse.status, 200);
    const { ticket: ownerTicket } = (await ownerResponse.json()) as {
      ticket: string;
    };
    assert.equal(typeof ownerTicket, "string");
    const ownerClaims = verifyPresenceTicket(ownerTicket);
    assert.equal(ownerClaims.userId, "alice");
    assert.equal(ownerClaims.roomId, 1);
    assert.match(ownerClaims.ticketId, /^[0-9a-f-]{36}$/);

    // Members who are not owners also receive room-scoped tickets.
    const memberResponse = await ticketFor("carol", "1");
    assert.equal(memberResponse.status, 200);
    const { ticket: memberTicket } = (await memberResponse.json()) as {
      ticket: string;
    };
    const memberClaims = verifyPresenceTicket(memberTicket);
    assert.equal(memberClaims.userId, "carol");
    assert.equal(memberClaims.roomId, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (ormDescriptor) Object.defineProperty(db, "orm", ormDescriptor);
    else Reflect.deleteProperty(db, "orm");
    delete process.env.PRESENCE_TICKET_SECRET;
  }
});

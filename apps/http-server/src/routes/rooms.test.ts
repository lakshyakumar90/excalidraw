import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { db } from "@repo/db";
import { configureInvitationRateLimiter } from "../invitationRateLimit.js";
import { roomsRouter } from "./rooms.js";

test("room ownership and invitation email are enforced", async () => {
  configureInvitationRateLimiter({
    consumeRateLimit: async () => ({
      allowed: true,
      retryAfterMs: 0,
      remaining: 100,
    }),
    publish: async () => {},
  });
  const ormDescriptor = Object.getOwnPropertyDescriptor(db, "orm");
  const transactionDescriptor = Object.getOwnPropertyDescriptor(
    db,
    "transaction",
  );
  const createdInvites: Array<Record<string, unknown>> = [];
  const roomRecord = { id: 1, adminId: "alice", slug: "Private", sceneId: "scene-1" };
  const orm = {
    public: {
      Room: {
        where: ({ id, adminId }: { id?: number; adminId?: string }) => ({
          first: async () =>
            id === 1 && (adminId === undefined || adminId === "alice")
              ? roomRecord
              : null,
        }),
      },
      RoomMember: {
        where: () => ({ first: async () => null }),
        create: async () => ({}),
      },
      Scene: { where: () => ({ first: async () => null }) },
      Invite: {
        where: (criteria: Record<string, unknown>) => ({
          first: async () =>
            createdInvites.find((invite) =>
              Object.entries(criteria).every(([key, value]) => invite[key] === value),
            ) ?? null,
          update: async () => ({}),
          include() { return this; },
          orderBy() { return this; },
          all: async () => createdInvites.map((invite) => ({
            ...invite,
            room: roomRecord,
            claim: null,
          })),
        }),
        create: async (invite: Record<string, unknown>) => {
          createdInvites.push({
            ...invite,
            createdAt: new Date().toISOString(),
            usedAt: null,
            revokedAt: null,
          });
          return {};
        },
      },
      User: {
        where: (criteria: Record<string, unknown>) => ({
          first: async () => {
            if (criteria.username === "friend")
              return { id: "bob", email: "friend@example.com", username: "friend", emailVerified: true };
            if (criteria.id === "bob")
              return { id: "bob", email: "friend@example.com", username: "friend", emailVerified: true };
            return null;
          },
        }),
      },
      InviteClaim: {
        where: () => ({ first: async () => null }),
        create: async () => ({}),
      },
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
    const { inviteUrl, delivery } = (await created.json()) as {
      inviteUrl: string;
      delivery: string;
    };
    assert.match(inviteUrl, /^http:\/\/localhost:3000\/invite\//);
    assert.ok(["sent", "failed", "manual-link"].includes(delivery));
    const byUsername = await fetch(`${base}/room/1/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user": "alice" },
      body: JSON.stringify({ email: "friend", role: "viewer" }),
    });
    assert.equal(byUsername.status, 201);
    assert.equal((await byUsername.json() as { email: string }).email, "friend@example.com");
    const inbox = await fetch(`${base}/room/invitations/inbox`, {
      headers: { "x-user": "bob" },
    });
    assert.equal(inbox.status, 200);
    const inboxData = await inbox.json() as { invitations: Array<{ id: string; role: string }> };
    assert.equal(inboxData.invitations.length, 2);
    const viewerInvite = inboxData.invitations.find((invite) => invite.role === "viewer");
    assert.ok(viewerInvite);
    const inboxAccepted = await fetch(
      `${base}/room/invitations/${viewerInvite.id}/accept`,
      { method: "POST", headers: { "x-user": "bob" } },
    );
    assert.equal(inboxAccepted.status, 200);
    assert.equal((await inboxAccepted.json() as { role: string }).role, "viewer");
    const code = decodeURIComponent(
      new URL(inviteUrl).pathname.split("/").at(-1)!,
    );
    assert.equal(
      (await fetch(`${base}/room/invites/${code}/accept`, { method: "POST" }))
        .status,
      200,
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

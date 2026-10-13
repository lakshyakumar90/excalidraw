import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { db } from "@repo/db";
import { configureInvitationRateLimiter } from "../invitationRateLimit.js";
import { roomsRouter } from "./rooms.js";

test("room ownership and in-app invitations by email or username are enforced", async () => {
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
  const claims: Array<Record<string, unknown>> = [];
  const createdMembers: Array<Record<string, unknown>> = [];
  const createdRooms: Array<Record<string, unknown>> = [];
  const createdScenes: Array<Record<string, unknown>> = [];
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
        create: async (room: Record<string, unknown>) => {
          const created = { ...room, id: 2 };
          createdRooms.push(created);
          return created;
        },
      },
      RoomMember: {
        where: (criteria: Record<string, unknown>) => ({
          first: async () => createdMembers.find((member) =>
            Object.entries(criteria).every(([key, value]) => member[key] === value),
          ) ?? null,
        }),
        create: async (member: Record<string, unknown>) => {
          createdMembers.push({ ...member, id: createdMembers.length + 1 });
          return {};
        },
      },
      Scene: {
        where: () => ({ first: async () => null }),
        create: async (scene: Record<string, unknown>) => {
          const created = { ...scene, id: "new-scene" };
          createdScenes.push(created);
          return created;
        },
      },
      Invite: {
        where: (criteria: Record<string, unknown>) => ({
          first: async () =>
            createdInvites.find((invite) =>
              Object.entries(criteria).every(([key, value]) => invite[key] === value),
            ) ?? null,
          update: async (values: Record<string, unknown>) => {
            const invite = createdInvites.find((item) =>
              Object.entries(criteria).every(([key, value]) => item[key] === value),
            );
            if (invite) Object.assign(invite, values);
            return {};
          },
          include() { return this; },
          orderBy() { return this; },
          all: async () => createdInvites.map((invite) => ({
            ...invite,
            room: roomRecord,
            claim: claims.find((claim) => claim.inviteId === invite.id) ?? null,
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
            if (criteria.id === "alice")
              return { id: "alice", email: "alice@example.com", name: "Alice Owner", emailVerified: true };
            if (criteria.username === "friend")
              return { id: "bob", email: "friend@example.com", username: "friend", emailVerified: true };
            if (criteria.id === "bob")
              return { id: "bob", email: "friend@example.com", username: "friend", emailVerified: true };
            return null;
          },
        }),
      },
      InviteClaim: {
        where: (criteria: Record<string, unknown>) => ({
          first: async () => claims.find((claim) =>
            Object.entries(criteria).every(([key, value]) => claim[key] === value),
          ) ?? null,
        }),
        create: async (claim: Record<string, unknown>) => {
          claims.push({ ...claim, createdAt: new Date().toISOString() });
          return {};
        },
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
    assert.equal(delivery, "in-app");
    const byUsername = await fetch(`${base}/room/1/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user": "alice" },
      body: JSON.stringify({ email: "friend", role: "viewer" }),
    });
    assert.equal(byUsername.status, 201);
    const usernameInvite = await byUsername.json() as { inviteId: string; email: string };
    assert.equal(usernameInvite.email, "friend@example.com");
    const shareLink = await fetch(
      `${base}/room/1/invites/${usernameInvite.inviteId}/link`,
      { method: "POST", headers: { "x-user": "alice" } },
    );
    assert.equal(shareLink.status, 200);
    const shareLinkData = await shareLink.json() as { inviteUrl: string; delivery: string };
    assert.match(shareLinkData.inviteUrl, /^http:\/\/localhost:3000\/invite\//);
    assert.equal(shareLinkData.delivery, "in-app");
    const inbox = await fetch(`${base}/room/invitations/inbox`, {
      headers: { "x-user": "bob" },
    });
    assert.equal(inbox.status, 200);
    const inboxData = await inbox.json() as { invitations: Array<{ id: string; role: string; inviterName: string; inviterEmail: string }> };
    assert.equal(inboxData.invitations.length, 2);
    assert.equal(inboxData.invitations[0]?.inviterName, "Alice Owner");
    assert.equal(inboxData.invitations[0]?.inviterEmail, "alice@example.com");
    const viewerInvite = inboxData.invitations.find((invite) => invite.role === "viewer");
    assert.ok(viewerInvite);
    const inboxAccepted = await fetch(
      `${base}/room/invitations/${viewerInvite.id}/accept`,
      { method: "POST", headers: { "x-user": "bob" } },
    );
    assert.equal(inboxAccepted.status, 200);
    assert.equal((await inboxAccepted.json() as { role: string }).role, "viewer");
    const remainingAfterAccept = await (await fetch(`${base}/room/invitations/inbox`, {
      headers: { "x-user": "bob" },
    })).json() as { invitations: Array<{ id: string }> };
    assert.equal(remainingAfterAccept.invitations.some((item) => item.id === viewerInvite.id), false);

    const editorInvite = remainingAfterAccept.invitations[0];
    assert.ok(editorInvite);
    const rejected = await fetch(`${base}/room/invitations/${editorInvite.id}/reject`, {
      method: "POST",
      headers: { "x-user": "bob" },
    });
    assert.equal(rejected.status, 204);
    assert.equal(createdMembers.some((member) => member.userId === "bob" && member.role === "editor"), false);
    const remainingAfterReject = await (await fetch(`${base}/room/invitations/inbox`, {
      headers: { "x-user": "bob" },
    })).json() as { invitations: Array<{ id: string }> };
    assert.equal(remainingAfterReject.invitations.length, 0);
    assert.equal(
      (await fetch(`${base}/room/1/invitations/${editorInvite.id}/reject`, {
        method: "POST",
        headers: { "x-user": "bob" },
      })).status,
      404,
    );
    const ownerInviteList = await (await fetch(`${base}/room/1/invites`, {
      headers: { "x-user": "alice" },
    })).json() as { invites: unknown[] };
    assert.equal(ownerInviteList.invites.length, 0);

    const blankRoom = await fetch(`${base}/room`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user": "alice" },
      body: JSON.stringify({ name: "New shared canvas" }),
    });
    assert.equal(blankRoom.status, 201);
    assert.equal(createdScenes.at(-1)?.ownerId, "alice");
    assert.deepEqual(createdScenes.at(-1)?.data, {
      elements: [],
      appState: { scrollX: 0, scrollY: 0, zoom: { value: 1 } },
      files: {},
    });
    assert.equal(createdRooms.at(-1)?.sceneId, "new-scene");
    const code = decodeURIComponent(
      new URL(inviteUrl).pathname.split("/").at(-1)!,
    );
    // A rejected invite is terminal, including for a previously issued link.
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

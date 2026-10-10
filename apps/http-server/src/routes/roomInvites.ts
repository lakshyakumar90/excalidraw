import { randomUUID } from "node:crypto";
import { Router } from "express";
import {
  isRoomInviteDeliveryConfigured,
  issueRoomInviteToken,
  sendRoomInvitationEmail,
  verifyRoomInviteToken,
} from "@repo/auth/room-invitation";
import {
  acceptEmailRoomInvite,
  acceptRoomJoinCode,
  changeRoomMemberRole,
  createRoomInvite,
  createRoomJoinCode,
  listRoomInvites,
  listRoomJoinCodes,
  listPendingRoomInvitesForEmail,
  markInviteSent,
  prepareRoomInviteResend,
  recordInviteDelivery,
  removeRoomMember,
  revokeEmailRoomInvite,
  revokeRoomJoinCode,
  db,
} from "@repo/db";
import {
  InviteSchema,
  JoinCodeSchema,
  RoomJoinCodeInputSchema,
  UpdateRoomMemberSchema,
} from "@repo/validations";
import { publishRoomAccessChanged } from "../invitationRateLimit.js";
import {
  accessibleRoom,
  applyInviteRateLimit,
  canonicalWebOrigin,
  codeHash,
  createJoinCode,
  isUniqueConflict,
  ownedRoom,
  roomIdOf,
  toCommitRole,
} from "./roomRouteUtils.js";

export function registerRoomInviteRoutes(router: Router): void {
  router.get("/invitations/inbox", async (req, res) => {
    try {
      const user = await db.orm!.public!.User.where({ id: req.userId! }).first();
      if (!user?.emailVerified)
        return res.status(403).json({ message: "Verify your email to view invitations" });
      const now = Date.now();
      const invites = await listPendingRoomInvitesForEmail(db, user.email);
      return res.json({
        invitations: invites
          .filter((invite) =>
            !invite.usedAt &&
            !invite.revokedAt &&
            Date.parse(invite.expiresAt) > now &&
            !invite.claim,
          )
          .map((invite) => ({
            id: invite.id,
            roomId: invite.roomId,
            roomName: invite.room.slug,
            role: invite.role,
            expiresAt: invite.expiresAt,
            createdAt: invite.createdAt,
          })),
      });
    } catch (error) {
      console.error("Invitation inbox error:", error);
      return res.status(500).json({ message: "Unable to load invitations" });
    }
  });

  router.post("/invitations/:inviteId/accept", async (req, res) => {
    try {
      if (
        !(await applyInviteRateLimit(
          req,
          res,
          "invite-accept-user",
          `${req.userId}:${req.ip}`,
          10,
          60_000,
        ))
      )
        return;
      const accepted = await acceptEmailRoomInvite(db, {
        inviteId: req.params.inviteId,
        userId: req.userId!,
      });
      if (!accepted)
        return res.status(404).json({ message: "Invitation unavailable for this account" });
      return res.json(accepted);
    } catch (error) {
      console.error("Inbox invitation acceptance error:", error);
      return res.status(500).json({ message: "Unable to accept invitation" });
    }
  });

  router.post("/:roomId/invites", async (req, res) => {
    const roomId = roomIdOf(req.params.roomId);
    if (!roomId) return res.status(404).json({ message: "Room not found" });
    const parsed = InviteSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "Invalid invitation" });
    try {
      if (!(await ownedRoom(roomId, req.userId!)))
        return res.status(404).json({ message: "Room not found" });
      if (
        !(await applyInviteRateLimit(
          req,
          res,
          "invite-owner-minute",
          req.userId!,
          10,
          60_000,
        )) ||
        !(await applyInviteRateLimit(
          req,
          res,
          "invite-room-hour",
          String(roomId),
          50,
          60 * 60_000,
        ))
      )
        return;
      const inviteId = randomUUID();
      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      let email = parsed.data.email;
      if (!email.includes("@")) {
        const target = await db.orm!.public!.User.where({ username: email }).first();
        if (!target)
          return res.status(404).json({ message: "No account found for that username. You can invite new users by email." });
        email = target.email.toLowerCase();
      }
      const token = issueRoomInviteToken({
        inviteId,
        roomId,
        email,
        role: parsed.data.role,
        expiresAt,
      });
      await createRoomInvite(db, {
        id: inviteId,
        codeHash: codeHash(token),
        email,
        role: parsed.data.role,
        roomId,
        expiresAt,
      });
      const url = `${canonicalWebOrigin()}/invite/${encodeURIComponent(token)}`;
      const sent = await sendRoomInvitationEmail({
        to: email,
        roomName: (await ownedRoom(roomId, req.userId!))?.slug ?? "Shared room",
        inviterName: "The room owner",
        role: parsed.data.role,
        expiresAt,
        url,
      });
      if (sent) await markInviteSent(db, inviteId);
      else
        await recordInviteDelivery(db, {
          id: inviteId,
          error: isRoomInviteDeliveryConfigured()
            ? "delivery-failed"
            : "not-configured",
        });
      return res.status(201).json({
        inviteId,
        roomId,
        email,
        role: parsed.data.role,
        expiresAt,
        inviteUrl: url,
        delivery: sent
          ? "sent"
          : isRoomInviteDeliveryConfigured()
            ? "failed"
            : "manual-link",
      });
    } catch (error) {
      console.error("Invitation creation error:", error);
      return res.status(500).json({ message: "Unable to create invitation" });
    }
  });

  router.post("/:roomId/invites/:inviteId/resend", async (req, res) => {
    const roomId = roomIdOf(req.params.roomId);
    if (!roomId) return res.status(404).json({ message: "Room not found" });
    try {
      if (!(await ownedRoom(roomId, req.userId!)))
        return res.status(404).json({ message: "Room not found" });
      if (
        !(await applyInviteRateLimit(
          req,
          res,
          "invite-owner-minute",
          req.userId!,
          10,
          60_000,
        ))
      )
        return;
      const existing = await db
        .orm!.public!.Invite.where({
          id: req.params.inviteId,
          roomId,
        })
        .first();
      if (!existing)
        return res.status(404).json({ message: "Invitation unavailable" });
      const token = issueRoomInviteToken({
        inviteId: existing.id,
        roomId,
        email: existing.email,
        role: existing.role as "editor" | "viewer",
        expiresAt: existing.expiresAt,
      });
      const invite = await prepareRoomInviteResend(db, {
        roomId,
        inviteId: existing.id,
        ownerId: req.userId!,
        codeHash: codeHash(token),
      });
      if (!invite)
        return res.status(409).json({ message: "Invitation is unavailable" });
      const url = `${canonicalWebOrigin()}/invite/${encodeURIComponent(token)}`;
      const sent = await sendRoomInvitationEmail({
        to: invite.email,
        roomName: invite.roomName,
        inviterName: "The room owner",
        role: invite.role as "editor" | "viewer",
        expiresAt: invite.expiresAt,
        url,
      });
      if (sent) await markInviteSent(db, invite.id);
      else
        await recordInviteDelivery(db, {
          id: invite.id,
          error: isRoomInviteDeliveryConfigured()
            ? "delivery-failed"
            : "not-configured",
        });
      return res.json({
        inviteUrl: url,
        delivery: sent
          ? "sent"
          : isRoomInviteDeliveryConfigured()
            ? "failed"
            : "manual-link",
      });
    } catch (error) {
      console.error("Invitation resend error:", error);
      return res.status(500).json({ message: "Unable to resend invitation" });
    }
  });

  router.post("/invites/:code/accept", async (req, res) => {
    const code = req.params.code;
    const legacy = /^[a-f0-9]{64}$/i.test(code);
    let claims: ReturnType<typeof verifyRoomInviteToken> | null = null;
    if (!legacy) {
      try {
        claims = verifyRoomInviteToken(code);
      } catch {
        return res.status(404).json({ message: "Invitation unavailable" });
      }
    }
    try {
      if (
        !(await applyInviteRateLimit(
          req,
          res,
          "invite-accept-user",
          `${req.userId}:${req.ip}`,
          10,
          60_000,
        ))
      )
        return;
      const accepted = await acceptEmailRoomInvite(db, {
        codeHash: codeHash(code),
        userId: req.userId!,
        ...(claims
          ? {
              inviteId: claims.inviteId,
              roomId: claims.roomId,
              email: claims.email,
              role: claims.role,
            }
          : {}),
      });
      if (!accepted)
        return res
          .status(404)
          .json({ message: "Invitation unavailable for this account" });
      return res.json({ roomId: accepted.roomId, role: accepted.role });
    } catch (error) {
      console.error("Invitation acceptance error:", error);
      return res.status(500).json({ message: "Unable to accept invitation" });
    }
  });

  router.post("/join-codes/:code/accept", async (req, res) => {
    const parsed = RoomJoinCodeInputSchema.safeParse(req.params.code);
    if (!parsed.success)
      return res.status(404).json({ message: "Invitation unavailable" });
    try {
      if (
        !(await applyInviteRateLimit(
          req,
          res,
          "join-code-accept-user",
          `${req.userId}:${req.ip}`,
          10,
          60_000,
        ))
      )
        return;
      const accepted = await acceptRoomJoinCode(db, {
        codeHash: codeHash(parsed.data),
        userId: req.userId!,
      });
      if (!accepted)
        return res.status(404).json({ message: "Invitation unavailable" });
      return res.json(accepted);
    } catch (error) {
      console.error("Join code acceptance error:", error);
      return res
        .status(503)
        .json({ message: "Invitation service is unavailable" });
    }
  });

  router.post("/:roomId/join-codes", async (req, res) => {
    const roomId = roomIdOf(req.params.roomId);
    if (!roomId) return res.status(404).json({ message: "Room not found" });
    const parsed = JoinCodeSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      return res.status(400).json({ message: "Invalid join code request" });
    try {
      if (!(await ownedRoom(roomId, req.userId!)))
        return res.status(404).json({ message: "Room not found" });
      if (
        !(await applyInviteRateLimit(
          req,
          res,
          "invite-owner-minute",
          req.userId!,
          10,
          60_000,
        )) ||
        !(await applyInviteRateLimit(
          req,
          res,
          "invite-room-hour",
          String(roomId),
          50,
          60 * 60_000,
        ))
      )
        return;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = createJoinCode();
        try {
          const expiresAt = new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toISOString();
          const id = randomUUID();
          await createRoomJoinCode(db, {
            id,
            codeHash: codeHash(code),
            role: parsed.data.role,
            roomId,
            expiresAt,
          });
          return res.status(201).json({
            id,
            code,
            role: parsed.data.role,
            expiresAt,
            url: `${canonicalWebOrigin()}/join/${code}`,
          });
        } catch (error) {
          if (!isUniqueConflict(error)) throw error;
        }
      }
      return res
        .status(503)
        .json({ message: "Could not create a unique join code" });
    } catch (error) {
      console.error("Join code creation error:", error);
      return res.status(500).json({ message: "Unable to create join code" });
    }
  });

  router.get("/:roomId/join-codes", async (req, res) => {
    const roomId = roomIdOf(req.params.roomId);
    if (!roomId) return res.status(404).json({ message: "Room not found" });
    try {
      if (!(await ownedRoom(roomId, req.userId!)))
        return res.status(404).json({ message: "Room not found" });
      const codes = await listRoomJoinCodes(db, roomId);
      return res.json({
        codes: codes.map((code) => ({
          id: code.id,
          role: code.role,
          expiresAt: code.expiresAt,
          createdAt: code.createdAt,
          revokedAt: code.revokedAt,
        })),
      });
    } catch (error) {
      console.error("Join code listing error:", error);
      return res.status(500).json({ message: "Unable to list join codes" });
    }
  });

  router.delete("/:roomId/join-codes/:codeId", async (req, res) => {
    const roomId = roomIdOf(req.params.roomId);
    if (!roomId) return res.status(404).json({ message: "Room not found" });
    try {
      const revoked = await revokeRoomJoinCode(db, {
        roomId,
        codeId: req.params.codeId,
        ownerId: req.userId!,
      });
      if (!revoked)
        return res.status(409).json({ message: "Join code is unavailable" });
      return res.status(204).end();
    } catch (error) {
      console.error("Join code revocation error:", error);
      return res.status(500).json({ message: "Unable to revoke join code" });
    }
  });

  router.get("/:roomId/members", async (req, res) => {
    const roomId = roomIdOf(req.params.roomId);
    if (!roomId) return res.status(404).json({ message: "Room not found" });
    try {
      const access = await accessibleRoom(roomId, req.userId!);
      if (!access) return res.status(404).json({ message: "Room not found" });
      const members = await db
        .orm!.public!.RoomMember.where({ roomId })
        .include("user")
        .all();
      return res.json({
        members: members.map((member) => ({
          id: member.userId,
          name: member.user.name,
          ...(access.role === "owner" ? { email: member.user.email } : {}),
          role: member.role,
        })),
      });
    } catch (error) {
      console.error("Room members error:", error);
      return res.status(500).json({ message: "Unable to list members" });
    }
  });

  router.delete("/:roomId/members/:userId", async (req, res) => {
    const roomId = roomIdOf(req.params.roomId);
    if (!roomId) return res.status(404).json({ message: "Room not found" });
    try {
      const removed = await removeRoomMember(db, {
        roomId,
        ownerId: req.userId!,
        userId: req.params.userId,
      });
      if (!removed)
        return res.status(404).json({ message: "Member not found" });
      try {
        await publishRoomAccessChanged({
          roomId,
          userId: req.params.userId,
          role: null,
        });
      } catch (error) {
        console.error(
          "Room access notification failed after member removal:",
          error,
        );
      }
      return res.status(204).end();
    } catch (error) {
      console.error("Member removal error:", error);
      return res.status(500).json({ message: "Unable to remove member" });
    }
  });

  router.patch("/:roomId/members/:userId", async (req, res) => {
    const roomId = roomIdOf(req.params.roomId);
    if (!roomId) return res.status(404).json({ message: "Room not found" });
    const parsed = UpdateRoomMemberSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "Invalid member role" });
    try {
      const changed = await changeRoomMemberRole(db, {
        roomId,
        ownerId: req.userId!,
        userId: req.params.userId,
        role: parsed.data.role,
      });
      if (!changed)
        return res.status(404).json({ message: "Member not found" });
      try {
        await publishRoomAccessChanged({
          roomId,
          userId: req.params.userId,
          role: parsed.data.role,
        });
      } catch (error) {
        console.error(
          "Room access notification failed after role change:",
          error,
        );
      }
      return res.json({ userId: req.params.userId, role: parsed.data.role });
    } catch (error) {
      console.error("Member role update error:", error);
      return res.status(500).json({ message: "Unable to update member role" });
    }
  });

  router.get("/:roomId/invites", async (req, res) => {
    const roomId = roomIdOf(req.params.roomId);
    if (!roomId) return res.status(404).json({ message: "Room not found" });
    try {
      if (!(await ownedRoom(roomId, req.userId!)))
        return res.status(404).json({ message: "Room not found" });
      const invites = await listRoomInvites(db, roomId);
      return res.json({
        invites: invites.map((invite) => ({
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
          usedAt:
            invite.usedAt ??
            (invite.claim?.action === "accepted"
              ? invite.claim.createdAt
              : null),
          revokedAt: invite.revokedAt,
          sentAt: invite.sentAt,
          deliveryError: invite.deliveryError,
          createdAt: invite.createdAt,
        })),
      });
    } catch (error) {
      console.error("Invitation list error:", error);
      return res.status(500).json({ message: "Unable to list invitations" });
    }
  });

  router.delete("/:roomId/invites/:inviteId", async (req, res) => {
    const roomId = roomIdOf(req.params.roomId);
    if (!roomId) return res.status(404).json({ message: "Room not found" });
    try {
      if (!(await ownedRoom(roomId, req.userId!)))
        return res.status(404).json({ message: "Room not found" });
      const revoked = await revokeEmailRoomInvite(db, {
        roomId,
        inviteId: req.params.inviteId,
        ownerId: req.userId!,
      });
      if (!revoked)
        return res.status(409).json({ message: "Invitation is unavailable" });
      return res.status(204).end();
    } catch (error) {
      console.error("Invitation revocation error:", error);
      return res.status(500).json({ message: "Unable to revoke invitation" });
    }
  });
}

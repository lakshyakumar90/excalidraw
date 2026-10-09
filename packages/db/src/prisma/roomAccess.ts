import type { db } from "./db.js";
import { randomUUID } from "node:crypto";

type RoomDb = typeof db;
type RoomDbContext = Pick<RoomDb, "orm">;
export type RoomMemberRole = "owner" | "editor" | "viewer";
export type CredentialClaimAction = "accepted" | "revoked";

const publicDb = (store: RoomDbContext) => store.orm!.public!;

export async function findRoomMember(
  store: RoomDb,
  roomId: number,
  userId: string,
) {
  return publicDb(store).RoomMember.where({ roomId, userId }).first();
}

export async function roomOwnedBy(
  store: RoomDb,
  roomId: number,
  ownerId: string,
) {
  return publicDb(store).Room.where({ id: roomId, adminId: ownerId }).first();
}

export async function listRoomInvites(store: RoomDb, roomId: number) {
  return publicDb(store)
    .Invite.where({ roomId })
    .include("claim")
    .orderBy((invite) => invite.createdAt.desc())
    .all();
}

export async function listRoomJoinCodes(store: RoomDb, roomId: number) {
  return publicDb(store)
    .JoinCode.where({ roomId })
    .orderBy((code) => code.createdAt.desc())
    .all();
}

export async function acceptEmailRoomInvite(
  store: RoomDb,
  input: {
    codeHash: string;
    userId: string;
    inviteId?: string;
    roomId?: number;
    email?: string;
    role?: "editor" | "viewer";
    now?: string;
  },
): Promise<{ roomId: number; role: RoomMemberRole } | null> {
  const now = input.now ?? new Date().toISOString();
  try {
    return await store.transaction(async (tx) => {
      const invite = await publicDb(tx).Invite.where({
        codeHash: input.codeHash,
      }).first();
      const user = await publicDb(tx).User.where({ id: input.userId }).first();
      if (
        !invite ||
        (input.inviteId && invite.id !== input.inviteId) ||
        (input.roomId && invite.roomId !== input.roomId) ||
        (input.email && invite.email.toLowerCase() !== input.email.toLowerCase()) ||
        (input.role && invite.role !== input.role) ||
        !user ||
        user.email.toLowerCase() !== invite.email.toLowerCase() ||
        !user.emailVerified ||
        Date.parse(invite.expiresAt) <= Date.parse(now) ||
        invite.revokedAt
      ) return null;

      const member = await publicDb(tx).RoomMember.where({
        roomId: invite.roomId,
        userId: input.userId,
      }).first();
      if (member) {
        return { roomId: invite.roomId, role: member.role as RoomMemberRole };
      }

      const claim = await publicDb(tx).InviteClaim.where({
        inviteId: invite.id,
      }).first();
      if (claim || invite.usedAt) return null;

      // inviteId is unique in InviteClaim: concurrent redemption and revocation
      // cannot both commit. Membership and claim share this transaction.
      await publicDb(tx).InviteClaim.create({
        inviteId: invite.id,
        actorId: input.userId,
        action: "accepted",
      });
      await publicDb(tx).RoomMember.create({
        roomId: invite.roomId,
        userId: input.userId,
        role: invite.role,
      });
      await publicDb(tx).Invite.where({ id: invite.id }).update({ usedAt: now });
      return { roomId: invite.roomId, role: invite.role as RoomMemberRole };
    });
  } catch (error) {
    // Unique claim or membership conflicts mean another concurrent request
    // won. Do not consume again or change an already-existing member's role.
    if (isUniqueConflict(error)) {
      const invite = await publicDb(store).Invite.where({
        codeHash: input.codeHash,
      }).first();
      if (invite) {
        const member = await findRoomMember(store, invite.roomId, input.userId);
        if (member)
          return { roomId: invite.roomId, role: member.role as RoomMemberRole };
      }
      return null;
    }
    throw error;
  }
}

export async function revokeEmailRoomInvite(
  store: RoomDb,
  input: { roomId: number; inviteId: string; ownerId: string; now?: string },
): Promise<boolean> {
  const now = input.now ?? new Date().toISOString();
  return store.transaction(async (tx) => {
    const room = await publicDb(tx).Room.where({
      id: input.roomId,
      adminId: input.ownerId,
    }).first();
    const invite = await publicDb(tx).Invite.where({
      id: input.inviteId,
      roomId: input.roomId,
    }).first();
    if (!room || !invite || invite.usedAt || invite.revokedAt) return false;
    const claim = await publicDb(tx).InviteClaim.where({
      inviteId: invite.id,
    }).first();
    if (claim) return false;
    await publicDb(tx).InviteClaim.create({
      inviteId: invite.id,
      actorId: input.ownerId,
      action: "revoked",
    });
    await publicDb(tx).Invite.where({ id: invite.id }).update({ revokedAt: now });
    return true;
  });
}

export async function acceptRoomJoinCode(
  store: RoomDb,
  input: { codeHash: string; userId: string; now?: string },
): Promise<{ roomId: number; role: RoomMemberRole } | null> {
  const now = input.now ?? new Date().toISOString();
  try {
    return await store.transaction(async (tx) => {
    const code = await publicDb(tx).JoinCode.where({
      codeHash: input.codeHash,
    }).first();
    if (!code || Date.parse(code.expiresAt) <= Date.parse(now) || code.revokedAt)
      return null;
    const user = await publicDb(tx).User.where({ id: input.userId }).first();
    if (!user || !user.emailVerified) return null;
    const member = await publicDb(tx).RoomMember.where({
      roomId: code.roomId,
      userId: input.userId,
    }).first();
    if (member) return { roomId: code.roomId, role: member.role as RoomMemberRole };
    await publicDb(tx).RoomMember.create({
      roomId: code.roomId,
      userId: input.userId,
      role: code.role,
    });
    return { roomId: code.roomId, role: code.role as RoomMemberRole };
    });
  } catch (error) {
    if (isUniqueConflict(error)) {
      const code = await publicDb(store).JoinCode.where({
        codeHash: input.codeHash,
      }).first();
      if (code) {
        const member = await findRoomMember(store, code.roomId, input.userId);
        if (member)
          return { roomId: code.roomId, role: member.role as RoomMemberRole };
      }
      return null;
    }
    throw error;
  }
}

export async function markInviteSent(
  store: RoomDb,
  inviteId: string,
  sentAt = new Date().toISOString(),
) {
  return publicDb(store).Invite.where({ id: inviteId }).update({
    sentAt,
    deliveryError: null,
  });
}

export async function revokeRoomJoinCode(
  store: RoomDb,
  input: { roomId: number; codeId: string; ownerId: string },
): Promise<boolean> {
  return store.transaction(async (tx) => {
    const room = await publicDb(tx).Room.where({
      id: input.roomId,
      adminId: input.ownerId,
    }).first();
    const code = await publicDb(tx).JoinCode.where({
      id: input.codeId,
      roomId: input.roomId,
    }).first();
    if (!room || !code || code.revokedAt) return false;
    // Join codes remain reusable by different invitees until they expire.
    // Revocation is represented directly on the code, not as a redemption.
    await publicDb(tx).JoinCode.where({ id: code.id }).update({
      revokedAt: new Date().toISOString(),
    });
    return true;
  });
}

export async function revokeEmailInviteByOwner(
  store: RoomDb,
  input: { roomId: number; inviteId: string; ownerId: string },
): Promise<boolean> {
  return revokeEmailRoomInvite(store, input);
}

export async function changeRoomMemberRole(
  store: RoomDb,
  input: {
    roomId: number;
    ownerId: string;
    userId: string;
    role: "editor" | "viewer";
  },
): Promise<boolean> {
  return store.transaction(async (tx) => {
    const room = await publicDb(tx).Room.where({
      id: input.roomId,
      adminId: input.ownerId,
    }).first();
    if (!room || input.userId === room.adminId) return false;
    const member = await publicDb(tx).RoomMember.where({
      roomId: input.roomId,
      userId: input.userId,
    }).first();
    if (!member || member.role === "owner") return false;
    await publicDb(tx).RoomMember.where({ id: member.id }).update({
      role: input.role,
    });
    return true;
  });
}

export async function removeRoomMember(
  store: RoomDb,
  input: { roomId: number; ownerId: string; userId: string },
): Promise<boolean> {
  return store.transaction(async (tx) => {
    const room = await publicDb(tx).Room.where({
      id: input.roomId,
      adminId: input.ownerId,
    }).first();
    if (!room || input.userId === room.adminId) return false;
    const member = await publicDb(tx).RoomMember.where({
      roomId: input.roomId,
      userId: input.userId,
    }).first();
    if (!member || member.role === "owner") return false;
    await publicDb(tx).RoomMember.where({ id: member.id }).delete();
    return true;
  });
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505",
  );
}

export async function createRoomInvite(
  store: RoomDb,
  input: {
    id: string;
    codeHash: string;
    email: string;
    role: "editor" | "viewer";
    roomId: number;
    expiresAt: string;
  },
) {
  return publicDb(store).Invite.create(input);
}

export async function prepareRoomInviteResend(
  store: RoomDb,
  input: {
    roomId: number;
    inviteId: string;
    ownerId: string;
    codeHash: string;
    now?: string;
  },
) {
  const now = input.now ?? new Date().toISOString();
  return store.transaction(async (tx) => {
    const room = await publicDb(tx).Room.where({
      id: input.roomId,
      adminId: input.ownerId,
    }).first();
    const invite = await publicDb(tx).Invite.where({
      id: input.inviteId,
      roomId: input.roomId,
    }).first();
    if (
      !room ||
      !invite ||
      invite.usedAt ||
      invite.revokedAt ||
      Date.parse(invite.expiresAt) <= Date.parse(now) ||
      (await publicDb(tx).InviteClaim.where({ inviteId: input.inviteId }).first())
    ) return null;
    await publicDb(tx).Invite.where({ id: invite.id }).update({
      codeHash: input.codeHash,
      sentAt: null,
      deliveryError: null,
    });
    return { ...invite, codeHash: input.codeHash, sentAt: null, deliveryError: null, roomName: room.slug };
  });
}

export async function recordInviteDelivery(
  store: RoomDb,
  input: { id: string; sentAt?: string; error?: string },
) {
  return publicDb(store).Invite.where({ id: input.id }).update({
    ...(input.sentAt ? { sentAt: input.sentAt } : {}),
    ...(input.error ? { deliveryError: input.error } : {}),
  });
}

export async function createRoomJoinCode(
  store: RoomDb,
  input: {
    id: string;
    codeHash: string;
    role: "editor" | "viewer";
    roomId: number;
    expiresAt: string;
  },
) {
  return publicDb(store).JoinCode.create(input);
}

export async function createOrGetSceneRoom(
  store: RoomDb,
  input: { sceneId: string; ownerId: string; name: string },
): Promise<{ roomId: number; slug: string } | null> {
  const existing = await publicDb(store).Room.where({
    sceneId: input.sceneId,
  }).first();
  if (existing)
    return existing.adminId === input.ownerId
      ? { roomId: existing.id, slug: existing.slug }
      : null;
  const suffix = randomUUID().slice(0, 8);
  const base = input.name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "room";
  const slug = `${base}-${suffix}`;
  try {
    return await store.transaction(async (tx) => {
      const scene = await publicDb(tx).Scene.where({
        id: input.sceneId,
        ownerId: input.ownerId,
      }).first();
      if (!scene) return null;
      const raced = await publicDb(tx).Room.where({
        sceneId: input.sceneId,
      }).first();
      if (raced)
        return raced.adminId === input.ownerId
          ? { roomId: raced.id, slug: raced.slug }
          : null;
      const room = await publicDb(tx).Room.create({
        slug,
        adminId: input.ownerId,
        sceneId: input.sceneId,
      });
      await publicDb(tx).RoomMember.create({
        roomId: room.id,
        userId: input.ownerId,
        role: "owner",
      });
      return { roomId: room.id, slug: room.slug };
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const room = await publicDb(store).Room.where({
      sceneId: input.sceneId,
    }).first();
    return room?.adminId === input.ownerId
      ? { roomId: room.id, slug: room.slug }
      : null;
  }
}

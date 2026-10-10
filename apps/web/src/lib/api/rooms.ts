import type { SavedScene, SceneData, SceneFileData } from "./scenes";
import { apiRequest } from "./request";

export async function getRoom(roomId: string): Promise<{
  roomId: number;
  name: string;
  role: "owner" | "editor" | "viewer";
  scene: SavedScene | null;
}> {
  return apiRequest(`/room/${encodeURIComponent(roomId)}`);
}

export interface RoomSummary {
  id: number;
  slug: string;
  sceneId: string | null;
  adminId: string;
  role: "owner" | "editor" | "viewer";
}

export async function listRooms(): Promise<RoomSummary[]> {
  const result = await apiRequest<{ rooms: RoomSummary[] }>("/room");
  return result.rooms;
}

export async function createRoom(
  name: string,
  sceneId: string,
): Promise<number> {
  const result = await apiRequest<{ roomId: number }>("/room", {
    method: "POST",
    body: JSON.stringify({ name, sceneId }),
  });
  return result.roomId;
}

export async function shareScene(
  name: string,
  sceneId: string,
): Promise<{ roomId: number; url: string }> {
  return apiRequest("/room/share", {
    method: "POST",
    body: JSON.stringify({ name, sceneId }),
  });
}

export async function createInvite(
  roomId: string,
  email: string,
  role: "editor" | "viewer" = "editor",
): Promise<{ inviteUrl: string; delivery: "sent" | "failed" | "manual-link" }> {
  const result = await apiRequest<{
    inviteUrl: string;
    delivery: "sent" | "failed" | "manual-link";
  }>(
    `/room/${encodeURIComponent(roomId)}/invites`,
    {
      method: "POST",
      body: JSON.stringify({ email, role }),
    },
  );
  return result;
}

export async function resendInvite(
  roomId: string,
  inviteId: string,
): Promise<{ inviteUrl: string; delivery: "sent" | "failed" | "manual-link" }> {
  return apiRequest(
    `/room/${encodeURIComponent(roomId)}/invites/${encodeURIComponent(inviteId)}/resend`,
    { method: "POST" },
  );
}

export async function acceptInvite(code: string): Promise<number> {
  const result = await apiRequest<{ roomId: number }>(
    `/room/invites/${encodeURIComponent(code)}/accept`,
    { method: "POST" },
  );
  return result.roomId;
}

export interface PendingRoomInvitation {
  id: string;
  roomId: number;
  roomName: string;
  role: "editor" | "viewer";
  expiresAt: string;
  createdAt: string;
}

export async function listMyRoomInvitations(): Promise<PendingRoomInvitation[]> {
  const result = await apiRequest<{ invitations: PendingRoomInvitation[] }>(
    "/room/invitations/inbox",
  );
  return result.invitations;
}

export async function acceptMyRoomInvitation(inviteId: string): Promise<number> {
  const result = await apiRequest<{ roomId: number }>(
    `/room/invitations/${encodeURIComponent(inviteId)}/accept`,
    { method: "POST" },
  );
  return result.roomId;
}

export async function createJoinCode(
  roomId: string,
  role: "editor" | "viewer",
): Promise<{ id: string; code: string; role: "editor" | "viewer"; expiresAt: string; url: string }> {
  return apiRequest(`/room/${encodeURIComponent(roomId)}/join-codes`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export interface RoomJoinCode {
  id: string;
  role: "editor" | "viewer";
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

export async function listJoinCodes(roomId: string): Promise<RoomJoinCode[]> {
  const result = await apiRequest<{ codes: RoomJoinCode[] }>(
    `/room/${encodeURIComponent(roomId)}/join-codes`,
  );
  return result.codes;
}

export async function revokeJoinCode(roomId: string, codeId: string): Promise<void> {
  await apiRequest(`/room/${encodeURIComponent(roomId)}/join-codes/${encodeURIComponent(codeId)}`, {
    method: "DELETE",
  });
}

export async function acceptJoinCode(code: string): Promise<number> {
  const result = await apiRequest<{ roomId: number }>(
    `/room/join-codes/${encodeURIComponent(code)}/accept`,
    { method: "POST" },
  );
  return result.roomId;
}

export async function saveRoomScene(
  roomId: string,
  data: SceneData,
): Promise<void> {
  await apiRequest(`/room/${encodeURIComponent(roomId)}/scene`, {
    method: "PATCH",
    body: JSON.stringify({ data }),
  });
}

/**
 * Fetch a short-lived presence ticket for the WebSocket handshake.
 * The ticket is kept in memory only — never persisted to storage —
 * and a fresh one is fetched on every reconnect.
 */
export async function fetchPresenceTicket(roomId: string): Promise<string> {
  const result = await apiRequest<{ ticket: string }>(
    `/room/${encodeURIComponent(roomId)}/presence-ticket`,
    { method: "POST" },
  );
  return result.ticket;
}

export async function uploadRoomFile(
  roomId: string,
  fileId: string,
  file: { id: string; mimeType: string; dataURL: string; created: number },
): Promise<number> {
  const result = await apiRequest<{ revision: number }>(
    `/room/${encodeURIComponent(roomId)}/files`,
    {
      method: "POST",
      body: JSON.stringify({ fileId, file }),
    },
  );
  return result.revision;
}

export async function fetchRoomFile(roomId: string, fileId: string): Promise<SceneFileData> {
  const result = await apiRequest<{ file: SceneFileData }>(
    `/room/${encodeURIComponent(roomId)}/files/${encodeURIComponent(fileId)}`,
  );
  return result.file;
}

export interface RoomMember {
  id: string;
  name: string;
  email?: string;
  role: "owner" | "editor" | "viewer";
}

export interface RoomInvite {
  id: string;
  email: string;
  expiresAt: string;
  usedAt: string | null;
  role: "editor" | "viewer";
  revokedAt: string | null;
  sentAt: string | null;
  deliveryError: string | null;
}

export async function listMembers(roomId: string): Promise<RoomMember[]> {
  const result = await apiRequest<{ members: RoomMember[] }>(
    `/room/${encodeURIComponent(roomId)}/members`,
  );
  return result.members;
}

export async function removeMember(
  roomId: string,
  userId: string,
): Promise<void> {
  await apiRequest(
    `/room/${encodeURIComponent(roomId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export async function updateMemberRole(
  roomId: string,
  userId: string,
  role: "editor" | "viewer",
): Promise<void> {
  await apiRequest(`/room/${encodeURIComponent(roomId)}/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function listInvites(roomId: string): Promise<RoomInvite[]> {
  const result = await apiRequest<{ invites: RoomInvite[] }>(
    `/room/${encodeURIComponent(roomId)}/invites`,
  );
  return result.invites;
}

export async function revokeInvite(
  roomId: string,
  inviteId: string,
): Promise<void> {
  await apiRequest(
    `/room/${encodeURIComponent(roomId)}/invites/${encodeURIComponent(inviteId)}`,
    { method: "DELETE" },
  );
}

export async function deleteRoom(roomId: string): Promise<void> {
  await apiRequest(`/room/${encodeURIComponent(roomId)}`, { method: "DELETE" });
}

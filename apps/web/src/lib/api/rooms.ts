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

export async function createInvite(
  roomId: string,
  email: string,
): Promise<string> {
  const result = await apiRequest<{ code: string }>(
    `/room/${encodeURIComponent(roomId)}/invites`,
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
  return result.code;
}

export async function acceptInvite(code: string): Promise<number> {
  const result = await apiRequest<{ roomId: number }>(
    `/room/invites/${encodeURIComponent(code)}/accept`,
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
  email: string;
  role: "owner" | "editor" | "viewer";
}

export interface RoomInvite {
  id: string;
  email: string;
  expiresAt: string;
  usedAt: string | null;
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

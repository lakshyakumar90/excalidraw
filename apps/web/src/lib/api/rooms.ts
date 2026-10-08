import type { SavedScene } from "./scenes";
import { apiRequest } from "./request";

export async function getRoom(roomId: string): Promise<{
  roomId: number;
  scene: SavedScene | null;
}> {
  return apiRequest(`/room/${encodeURIComponent(roomId)}`);
}

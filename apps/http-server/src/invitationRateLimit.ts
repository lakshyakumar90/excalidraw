import type { RoomRedis } from "@repo/redis";

let store: Pick<RoomRedis, "consumeRateLimit" | "publish"> | null = null;

export function configureInvitationRateLimiter(
  roomRedis: Pick<RoomRedis, "consumeRateLimit" | "publish">,
): void {
  store = roomRedis;
}

export async function publishRoomAccessChanged(input: {
  roomId: number;
  userId: string;
  role: "owner" | "editor" | "viewer" | null;
}): Promise<void> {
  if (!store) throw new Error("Room access notification is unavailable.");
  await store.publish({ type: "room.access.changed", ...input });
}

export async function checkInvitationRateLimit(input: {
  bucket: string;
  subject: string;
  limit: number;
  windowMs: number;
}) {
  if (!store) throw new Error("Invitation rate limiting is unavailable.");
  return store.consumeRateLimit(input);
}

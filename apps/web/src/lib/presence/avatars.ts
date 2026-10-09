import type { PresenceParticipant } from "@repo/common";

export interface AvatarEntry {
  userId: string;
  displayName: string;
  isSelf: boolean;
  connectionId: string;
  canJump: boolean;
}

/** Deduplicate tabs by user for the avatar stack; jumps target one tab. */
export function avatarEntries(
  participants: PresenceParticipant[],
  selfUserId: string | null,
): AvatarEntry[] {
  const byUser = new Map<string, AvatarEntry>();
  for (const participant of participants) {
    const isSelf = selfUserId !== null && participant.userId === selfUserId;
    const existing = byUser.get(participant.userId);
    const canJump = participant.viewport !== undefined;
    if (!existing) {
      byUser.set(participant.userId, {
        userId: participant.userId,
        displayName: isSelf
          ? `${participant.displayName} (you)`
          : participant.displayName,
        isSelf,
        connectionId: participant.connectionId,
        canJump,
      });
      continue;
    }
    // Prefer a tab with a known viewport so jump stays enabled.
    if (!existing.canJump && canJump) {
      byUser.set(participant.userId, {
        ...existing,
        connectionId: participant.connectionId,
        canJump,
      });
    }
  }
  return [...byUser.values()].sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

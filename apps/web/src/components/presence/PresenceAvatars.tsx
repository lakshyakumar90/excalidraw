"use client";

import type { PresenceParticipant } from "@repo/common";
import { avatarEntries } from "@/lib/presence/avatars";
import { colorForUserId, initialsForName } from "@/lib/presence/colors";

const MAX_VISIBLE_AVATARS = 8;

/**
 * Avatar stack pinned to the top-right below the account link. Hover or focus
 * reveals the participant name; activating jumps to their shared scene area.
 */
export function PresenceAvatars({
  participants,
  selfUserId,
  onJump,
}: {
  participants: PresenceParticipant[];
  selfUserId: string | null;
  onJump: (connectionId: string) => void;
}) {
  const entries = avatarEntries(participants, selfUserId);
  if (entries.length === 0) return null;
  const visible = entries.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = entries.length - visible.length;

  return (
    <div
      aria-label="Room participants"
      className="fixed right-4 top-16 z-40 flex items-center gap-1.5"
    >
      {visible.map((entry) => {
        const color = colorForUserId(entry.userId);
        return (
          <button
            key={entry.userId}
            type="button"
            title={
              entry.canJump
                ? `Jump to ${entry.displayName}'s view`
                : `${entry.displayName} hasn't shared a view yet`
            }
            aria-label={
              entry.canJump
                ? `Jump to ${entry.displayName}'s view`
                : entry.displayName
            }
            disabled={!entry.canJump}
            onClick={() => onJump(entry.connectionId)}
            className="grid h-9 w-9 place-items-center rounded-full border-2 border-white text-xs font-semibold text-white shadow-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:scale-105"
            style={{ backgroundColor: color }}
          >
            {initialsForName(entry.displayName)}
          </button>
        );
      })}
      {overflow > 0 && (
        <span
          aria-label={`${overflow} more participants`}
          className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-neutral-500 text-xs font-semibold text-white shadow-md"
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

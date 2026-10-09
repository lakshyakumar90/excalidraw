"use client";

import { usePresence } from "@/hooks/presence/usePresence";
import { setCurrentViewport } from "@/lib/persistence/viewportStore";
import { computeJumpViewport } from "@/lib/presence/viewportJump";
import { PresenceAvatars } from "@/components/presence/PresenceAvatars";
import { PresenceCursors } from "@/components/presence/PresenceCursors";
import { PresenceStatus } from "@/components/presence/PresenceStatus";

/**
 * Room presence overlay: live cursors, participant avatars with viewport
 * jump, and the presence connection indicator. Mounted keyed by room so a
 * room change always starts a fresh channel.
 */
export function RoomPresence({ roomId }: { roomId: string }) {
  const { status, detail, participants, selfUserId } = usePresence(roomId);

  const handleJump = (connectionId: string) => {
    const target = participants.find(
      (participant) => participant.connectionId === connectionId,
    )?.viewport;
    if (!target) return;
    setCurrentViewport(
      computeJumpViewport(target, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  };

  return (
    <>
      <PresenceCursors participants={participants} selfUserId={selfUserId} />
      <PresenceAvatars
        participants={participants}
        selfUserId={selfUserId}
        onJump={handleJump}
      />
      <PresenceStatus status={status} detail={detail} />
    </>
  );
}

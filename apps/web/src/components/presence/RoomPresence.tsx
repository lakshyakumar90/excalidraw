"use client";

import { useMemo } from "react";
import type { Element, TombstoneMap } from "@repo/common";
import { useRoomSync } from "@/hooks/sync/useRoomSync";
import { setCurrentViewport } from "@/lib/persistence/viewportStore";
import { computeJumpViewport } from "@/lib/presence/viewportJump";
import { PresenceAvatars } from "@/components/presence/PresenceAvatars";
import { PresenceCursors } from "@/components/presence/PresenceCursors";
import { PresenceStatus } from "@/components/presence/PresenceStatus";
import { RemotePreviews } from "@/components/presence/RemotePreviews";
import { RemoteSelections } from "@/components/presence/RemoteSelections";
import { SyncStatus } from "@/components/presence/SyncStatus";

/**
 * Room presence + sync overlay: live cursors, participant avatars with
 * viewport jump, the presence connection indicator, and the save/sync
 * indicator. Mounted keyed by room so a room change always starts fresh.
 */
export function RoomPresence({
  roomId,
  sceneId,
  httpScene,
}: {
  roomId: string;
  sceneId: string;
  httpScene: {
    elements: Element[];
    tombstones: TombstoneMap;
    revision: number;
  } | null;
}) {
  const syncHttpScene = useMemo(() => httpScene, [httpScene]);
  const sync = useRoomSync({ roomId, sceneId, httpScene: syncHttpScene });
  const { status, detail, participants, selfUserId, selections, previews } = sync;

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
      <RemotePreviews previews={previews} participants={participants} />
      <RemoteSelections selections={selections} />
      <PresenceAvatars
        participants={participants}
        selfUserId={selfUserId}
        onJump={handleJump}
      />
      <PresenceStatus status={status} detail={detail} />
      <SyncStatus sync={sync} />
    </>
  );
}

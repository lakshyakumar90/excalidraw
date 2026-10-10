"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { Element, TombstoneMap } from "@repo/common";
import type { RoomRole } from "@repo/common";
import { useRoomSync } from "@/hooks/sync/useRoomSync";
import { easeFollowViewport } from "@/lib/presence/follow";
import { followState } from "@/lib/presence/laser";
import {
  getCurrentViewport,
  setCurrentViewport,
} from "@/lib/persistence/viewportStore";
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
  role,
}: {
  roomId: string;
  sceneId: string;
  role: RoomRole;
  httpScene: {
    elements: Element[];
    tombstones: TombstoneMap;
    revision: number;
  } | null;
}) {
  const syncHttpScene = useMemo(() => httpScene, [httpScene]);
  const sync = useRoomSync({ roomId, sceneId, httpScene: syncHttpScene, role });
  const { status, detail, participants, selfUserId, selections, previews } =
    sync;

  const [following, setFollowing] = useState<string | null>(null);
  const activeFollowing = status === "live" ? following : null;
  const participantsRef = useRef(participants);
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);
  useEffect(() => {
    followState.active = Boolean(activeFollowing);
    if (!activeFollowing || status !== "live") return;
    let frame = 0,
      last = performance.now(),
      lastUpdate = last,
      lastTarget = "";
    const stop = () => {
      followState.active = false;
      setFollowing(null);
    };
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" ||
        (!e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          [
            " ",
            "+",
            "-",
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
          ].includes(e.key))
      )
        stop();
    };
    const tick = (now: number) => {
      if (!followState.active) return;
      const target = participantsRef.current.find(
        (p) => p.connectionId === activeFollowing,
      )?.viewport;
      if (!target) {
        stop();
        return;
      }
      const signature = JSON.stringify(target);
      if (signature !== lastTarget) {
        lastTarget = signature;
        lastUpdate = now;
      }
      if (now - lastUpdate > 30000) {
        stop();
        return;
      }
      const desired = computeJumpViewport(target, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
        current = getCurrentViewport();
      const next = easeFollowViewport(
        current,
        desired,
        now - last,
        matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
      last = now;
      if (
        Math.abs(next.zoom - current.zoom) > 1e-5 ||
        Math.abs(next.scrollX - current.scrollX) > 1e-3 ||
        Math.abs(next.scrollY - current.scrollY) > 1e-3
      )
        setCurrentViewport(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener("canvas-user-interaction", stop);
    window.addEventListener("wheel", stop, { passive: true, capture: true });
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(frame);
      followState.active = false;
      window.removeEventListener("canvas-user-interaction", stop);
      window.removeEventListener("wheel", stop, true);
      window.removeEventListener("keydown", key);
    };
  }, [activeFollowing, status]);
  useEffect(() => {
    if (status !== "live") followState.active = false;
  }, [status]);
  const handleJump = (connectionId: string) => {
    followState.active = true;
    setFollowing(connectionId);
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
      {activeFollowing && (
        <button
          className="fixed right-4 top-28 z-50 min-h-11 rounded-lg bg-white px-3 text-sm shadow-sm focus-visible:outline-2 focus-visible:outline-violet-600"
          onClick={() => {
            followState.active = false;
            setFollowing(null);
          }}
        >
          Following{" "}
          {
            participants.find((p) => p.connectionId === activeFollowing)
              ?.displayName
          }{" "}
          · Stop
        </button>
      )}
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

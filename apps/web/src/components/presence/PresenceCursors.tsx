"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Point, PresenceParticipant } from "@repo/common";
import { sceneToViewport } from "@repo/engine";
import {
  getCurrentViewport,
  getInitialViewport,
  subscribeViewport,
} from "@/lib/persistence/viewportStore";
import { colorForUserId } from "@/lib/presence/colors";
import { stepCursorTowards } from "@/lib/presence/interpolation";

interface RemoteCursor {
  participant: PresenceParticipant;
  displayed: Point;
}

/**
 * Renders remote presence cursors above the interactive canvas layer.
 * Screen positions derive from each remote scene point and the local
 * viewport on every frame, so cursors stay aligned through local pan/zoom.
 * Cursors never enter the scene store, history, selection, or autosave data.
 */
export function PresenceCursors({
  participants,
  selfUserId,
}: {
  participants: PresenceParticipant[];
  selfUserId: string | null;
}) {
  const viewport = useSyncExternalStore(
    subscribeViewport,
    getCurrentViewport,
    getInitialViewport,
  );
  const targetsRef = useRef(new Map<string, PresenceParticipant>());
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);

  useEffect(() => {
    const targets = new Map<string, PresenceParticipant>();
    for (const participant of participants) {
      if (!participant.pointer) continue;
      if (selfUserId !== null && participant.userId === selfUserId) continue;
      targets.set(participant.connectionId, participant);
    }
    targetsRef.current = targets;
  }, [participants, selfUserId]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = now - last;
      last = now;
      const targets = targetsRef.current;
      setCursors((previous) => {
        const previousById = new Map(
          previous.map((cursor) => [cursor.participant.connectionId, cursor]),
        );
        let changed = previousById.size !== targets.size;
        const next: RemoteCursor[] = [];
        for (const participant of targets.values()) {
          const target = participant.pointer!;
          const existing = previousById.get(participant.connectionId);
          const displayed = existing
            ? stepCursorTowards(existing.displayed, target, elapsed)
            : { ...target };
          if (
            !existing ||
            displayed.x !== existing.displayed.x ||
            displayed.y !== existing.displayed.y ||
            existing.participant.displayName !== participant.displayName ||
            existing.participant.userId !== participant.userId
          ) {
            changed = true;
          }
          next.push({ participant, displayed });
        }
        return changed ? next : previous;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (cursors.length === 0) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30">
      {cursors.map(({ participant, displayed }) => {
        const screen = sceneToViewport(displayed, viewport);
        const color = colorForUserId(participant.userId);
        return (
          <div
            key={participant.connectionId}
            className="absolute left-0 top-0 flex items-start"
            style={{
              transform: `translate(${screen.x}px, ${screen.y}px)`,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={color}
              stroke="white"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M5 3l14 7-6.5 1.5L9 18z" />
            </svg>
            <span
              className="ml-1 max-w-40 truncate rounded-full px-2 py-0.5 text-[11px] font-medium text-white shadow-sm"
              style={{ backgroundColor: color }}
            >
              {participant.displayName}
            </span>
          </div>
        );
      })}
    </div>
  );
}

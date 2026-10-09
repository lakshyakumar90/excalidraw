"use client";

import { useSyncExternalStore } from "react";
import type { PresenceParticipant, PreviewWireElement } from "@repo/common";
import { sceneToViewport } from "@repo/engine";
import type { PreviewStore } from "@repo/engine";
import {
  getCurrentViewport,
  getInitialViewport,
  subscribeViewport,
} from "@/lib/persistence/viewportStore";
import { colorForUserId } from "@/lib/presence/colors";

function PreviewShape({
  element,
  color,
  project,
}: {
  element: PreviewWireElement;
  color: string;
  project: (x: number, y: number) => { x: number; y: number };
}) {
  const origin = project(element.x, element.y);
  const common = {
    fill: color,
    fillOpacity: 0.1,
    stroke: color,
    strokeWidth: 1.5,
    strokeDasharray: "5 3",
  } as const;

  const width = element.width ?? 0;
  const height = element.height ?? 0;
  const corner = project(element.x + width, element.y + height);
  const w = Math.max(2, corner.x - origin.x);
  const h = Math.max(2, corner.y - origin.y);
  const angle = element.angle ?? 0;
  const rotate =
    angle !== 0 ? `rotate(${angle} ${origin.x + w / 2} ${origin.y + h / 2})` : undefined;

  if (element.points && element.points.length > 0) {
    const points = element.points
      .map((point) => {
        const screen = project(element.x + point.x, element.y + point.y);
        return `${screen.x},${screen.y}`;
      })
      .join(" ");
    return <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeDasharray="5 3" opacity={0.85} />;
  }
  if (element.text !== undefined) {
    const size = 16;
    return (
      <text x={origin.x} y={origin.y + size} fontSize={size} fill={color} opacity={0.9}>
        {element.text.slice(0, 200)}
      </text>
    );
  }
  // Shape ghosts keyed only by geometry: rectangles, ellipses, diamonds,
  // and images (dashed placeholder) all render from their bounds.
  return (
    <g transform={rotate}>
      <rect x={origin.x} y={origin.y} width={w} height={h} rx={3} {...common} />
    </g>
  );
}

/**
 * Ephemeral remote drag ghosts on a separate overlay layer. Positions derive
 * from remote scene geometry and the local viewport every render, so ghosts
 * stay aligned through local pan/zoom. Never persisted, never in history.
 */
export function RemotePreviews({
  previews,
  participants,
}: {
  previews: PreviewStore;
  participants: PresenceParticipant[];
}) {
  const version = useSyncExternalStore(
    previews.subscribe,
    previews.getSnapshot,
    previews.getSnapshot,
  );
  const viewport = useSyncExternalStore(
    subscribeViewport,
    getCurrentViewport,
    getInitialViewport,
  );
  void version;
  const names = new Map(
    participants.map((participant) => [participant.connectionId, participant]),
  );
  const entries = previews.getPreviews();
  if (entries.length === 0) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30">
      <svg className="h-full w-full">
        {entries.flatMap((entry) => {
          const participant = names.get(entry.connectionId);
          const color = colorForUserId(
            participant?.userId ?? entry.connectionId,
          );
          return entry.elements.map((element) => (
            <PreviewShape
              key={`${entry.key}:${element.id}`}
              element={element}
              color={color}
              project={(x, y) => sceneToViewport({ x, y }, viewport)}
            />
          ));
        })}
      </svg>
    </div>
  );
}

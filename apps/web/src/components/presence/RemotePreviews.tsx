"use client";

import { useId, useMemo, useSyncExternalStore } from "react";
import { scene } from "@/lib/scene/scene";
import type {
  Element,
  PresenceParticipant,
  PreviewWireElement,
} from "@repo/common";
import {
  getElementAxisAlignedBounds,
  renderSceneToSvg,
  sceneToViewport,
} from "@repo/engine";
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
    angle !== 0
      ? `rotate(${angle} ${origin.x + w / 2} ${origin.y + h / 2})`
      : undefined;

  if (element.points && element.points.length > 0) {
    const points = element.points
      .map((point) => {
        const screen = project(element.x + point.x, element.y + point.y);
        return `${screen.x},${screen.y}`;
      })
      .join(" ");
    return (
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray="5 3"
        opacity={0.85}
      />
    );
  }
  if (element.text !== undefined) {
    const size = 16;
    return (
      <text
        x={origin.x}
        y={origin.y + size}
        fontSize={size}
        fill={color}
        opacity={0.9}
      >
        {element.text.slice(0, 200)}
      </text>
    );
  }
  if (element.type === "ellipse") {
    return (
      <ellipse
        cx={origin.x + w / 2}
        cy={origin.y + h / 2}
        rx={w / 2}
        ry={h / 2}
        {...common}
        transform={rotate}
      />
    );
  }
  if (element.type === "diamond") {
    return (
      <polygon
        points={`${origin.x + w / 2},${origin.y} ${origin.x + w},${origin.y + h / 2} ${origin.x + w / 2},${origin.y + h} ${origin.x},${origin.y + h / 2}`}
        {...common}
        transform={rotate}
      />
    );
  }
  // Rectangles and image placeholders use the same bounds preview.
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
  const clipPrefix = useId();
  useSyncExternalStore(scene.subscribe, scene.getSnapshot, scene.getSnapshot);
  const { subscribe, getSnapshot } = useMemo(
    () => ({
      subscribe: (listener: () => void) => previews.subscribe(listener),
      getSnapshot: () => previews.getSnapshot(),
    }),
    [previews],
  );
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const viewport = useSyncExternalStore(
    subscribeViewport,
    getCurrentViewport,
    getInitialViewport,
  );
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
          return entry.elements.map((element, index) => {
            const frameId = (
              "frameId" in element
                ? element.frameId
                : scene.getElement(element.id)?.frameId
            ) as string | undefined;
            const candidate =
              entry.elements.find(
                (e) => e.id === frameId && e.type === "frame",
              ) ?? scene.getElement(frameId ?? "");
            const frame = candidate?.type === "frame" ? candidate : null;
            const p = frame
              ? sceneToViewport({ x: frame.x, y: frame.y }, viewport)
              : null;
            const clip =
              clipPrefix +
              "-" +
              entry.key.replace(/[^a-zA-Z0-9]/g, "") +
              "-" +
              index;
            return (
              <g key={entry.key + ":" + element.id}>
                {frame && p && (
                  <defs>
                    <clipPath id={clip}>
                      <rect
                        x={p.x}
                        y={p.y}
                        width={(frame.width ?? 0) * viewport.zoom}
                        height={(frame.height ?? 0) * viewport.zoom}
                      />
                    </clipPath>
                  </defs>
                )}
                <g clipPath={frame ? "url(#" + clip + ")" : undefined}>
                  {entry.gestureId.startsWith("commit:") &&
                  "type" in element ? (
                    <FinishedPreview
                      element={element as Element}
                      zoom={viewport.zoom}
                      project={(x, y) => sceneToViewport({ x, y }, viewport)}
                    />
                  ) : (
                    <PreviewShape
                      element={element}
                      color={color}
                      project={(x, y) => sceneToViewport({ x, y }, viewport)}
                    />
                  )}
                </g>
              </g>
            );
          });
        })}
      </svg>
    </div>
  );
}

/** Final styles render immediately; this overlay never enters the scene/save. */
function FinishedPreview({
  element,
  zoom,
  project,
}: {
  element: Element;
  zoom: number;
  project: (x: number, y: number) => { x: number; y: number };
}) {
  const bounds = getElementAxisAlignedBounds(element);
  const padding = 8;
  const origin = project(bounds.minX - padding, bounds.minY - padding);
  const svg = renderSceneToSvg([element], { padding });
  return (
    <image
      x={origin.x}
      y={origin.y}
      width={Math.ceil(bounds.maxX - bounds.minX + padding * 2) * zoom}
      height={Math.ceil(bounds.maxY - bounds.minY + padding * 2) * zoom}
      href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
    />
  );
}

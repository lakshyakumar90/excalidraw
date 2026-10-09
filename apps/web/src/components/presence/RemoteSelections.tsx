"use client";

import { useSyncExternalStore } from "react";
import type { Element } from "@repo/common";
import { sceneToViewport } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import {
  getCurrentViewport,
  getInitialViewport,
  subscribeViewport,
} from "@/lib/persistence/viewportStore";
import { colorForUserId } from "@/lib/presence/colors";
import type { RemoteSelection } from "@/lib/sync/roomSync";

function SelectionOutline({
  element,
  color,
  project,
}: {
  element: Element;
  color: string;
  project: (x: number, y: number) => { x: number; y: number };
}) {
  const origin = project(element.x, element.y);
  const width = element.width ?? 0;
  const height = element.height ?? 0;
  const corner = project(element.x + width, element.y + height);
  const w = corner.x - origin.x;
  const h = corner.y - origin.y;
  const angle = element.angle ?? 0;
  const center = `${origin.x + w / 2} ${origin.y + h / 2}`;
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeDasharray: "4 2",
    opacity: 0.65,
  } as const;

  if (
    (element.type === "line" ||
      element.type === "arrow" ||
      element.type === "freedraw") &&
    Array.isArray(element.points) &&
    element.points.length > 0
  ) {
    const points = element.points
      .map((point) => {
        const screen = project(element.x + point.x, element.y + point.y);
        return `${screen.x},${screen.y}`;
      })
      .join(" ");
    return <polyline points={points} {...common} />;
  }
  if (element.type === "ellipse") {
    return (
      <g transform={angle !== 0 ? `rotate(${angle} ${center})` : undefined}>
        <ellipse
          cx={origin.x + w / 2}
          cy={origin.y + h / 2}
          rx={Math.abs(w / 2)}
          ry={Math.abs(h / 2)}
          {...common}
        />
      </g>
    );
  }
  if (element.type === "diamond") {
    const cx = origin.x + w / 2;
    const cy = origin.y + h / 2;
    return (
      <g transform={angle !== 0 ? `rotate(${angle} ${center})` : undefined}>
        <polygon
          points={`${cx},${origin.y} ${origin.x + w},${cy} ${cx},${origin.y + h} ${origin.x},${cy}`}
          {...common}
        />
      </g>
    );
  }
  return (
    <g transform={angle !== 0 ? `rotate(${angle} ${center})` : undefined}>
      <rect x={origin.x} y={origin.y} width={w} height={h} {...common} />
    </g>
  );
}

/**
 * Faint per-user selection outlines. Looks up committed local elements by
 * ID (missing/deleted IDs are skipped), never mutates styles, selection, or
 * history, and never intercepts pointer input.
 */
export function RemoteSelections({
  selections,
}: {
  selections: RemoteSelection[];
}) {
  const viewport = useSyncExternalStore(
    subscribeViewport,
    getCurrentViewport,
    getInitialViewport,
  );
  // Re-render when the scene changes so outlines track remote geometry.
  useSyncExternalStore(scene.subscribe, scene.getSnapshot, scene.getSnapshot);
  const outlines: { key: string; element: Element; color: string }[] = [];
  for (const selection of selections) {
    const color = colorForUserId(selection.userId);
    for (const id of selection.elementIds) {
      const element = scene.getElement(id);
      if (!element || element.isDeleted) continue;
      outlines.push({ key: `${selection.connectionId}:${id}`, element, color });
    }
  }
  if (outlines.length === 0) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30">
      <svg className="h-full w-full">
        {outlines.map(({ key, element, color }) => (
          <SelectionOutline
            key={key}
            element={element}
            color={color}
            project={(x, y) => sceneToViewport({ x, y }, viewport)}
          />
        ))}
      </svg>
    </div>
  );
}

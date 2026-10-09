import type { Point, Viewport } from "@repo/common";
import { MIN_ZOOM, MAX_ZOOM } from "@repo/common";

export function touchViewport(
  start: readonly Point[],
  current: readonly Point[],
  viewport: Viewport,
): Viewport {
  if (start.length < 2 || current.length < 2) return viewport;
  const a = start[0]!,
    b = start[1]!,
    c = current[0]!,
    d = current[1]!;
  const origin = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    center = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
  const zoom = Math.max(
    MIN_ZOOM,
    Math.min(
      MAX_ZOOM,
      (viewport.zoom * Math.hypot(c.x - d.x, c.y - d.y)) /
        Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    ),
  );
  return {
    zoom,
    scrollX: center.x - ((origin.x - viewport.scrollX) / viewport.zoom) * zoom,
    scrollY: center.y - ((origin.y - viewport.scrollY) / viewport.zoom) * zoom,
  };
}

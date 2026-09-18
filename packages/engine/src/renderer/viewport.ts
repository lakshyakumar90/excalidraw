import type { Point, Size, Viewport } from "@repo/common";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function viewportToSceneBounds(size: Size, viewport: Viewport): Bounds {
  return {
    minX: -viewport.scrollX / viewport.zoom,
    minY: -viewport.scrollY / viewport.zoom,
    maxX: (size.width - viewport.scrollX) / viewport.zoom,
    maxY: (size.height - viewport.scrollY) / viewport.zoom,
  };
}

export function sceneBoundsToViewport(
  bounds: Bounds,
  viewport: Viewport,
): Bounds {
  return {
    minX: bounds.minX * viewport.zoom + viewport.scrollX,
    minY: bounds.minY * viewport.zoom + viewport.scrollY,
    maxX: bounds.maxX * viewport.zoom + viewport.scrollX,
    maxY: bounds.maxY * viewport.zoom + viewport.scrollY,
  };
}

export function pointInBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

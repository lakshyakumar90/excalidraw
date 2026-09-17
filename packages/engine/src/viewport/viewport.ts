import {
  MAX_ZOOM,
  MIN_ZOOM,
  type Point,
  type Viewport,
} from "@repo/common";
import { clamp } from "../utils/clamp";

export function clampZoom(zoom: number): number {
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

//cursor stays over the same scene point
export function zoomAtPoint(
  viewport: Viewport,
  cursor: Point,
  requestedZoom: number,
): Viewport {
  const nextZoom = clampZoom(requestedZoom);

  const scenePoint = {
    x: (cursor.x - viewport.scrollX) / viewport.zoom,
    y: (cursor.y - viewport.scrollY) / viewport.zoom,
  };
  
  return {
    zoom: nextZoom,
    scrollX: cursor.x -scenePoint.x * nextZoom,
    scrollY: cursor.y - scenePoint.y * nextZoom,
  }
}
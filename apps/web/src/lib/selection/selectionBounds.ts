import type { Element, Point } from "@repo/common";
import { getElementBounds } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import type { ResizeHandle } from "./handles";

export type Rect = { minX: number; minY: number; maxX: number; maxY: number };
export function getSelectionBounds(ids: readonly string[]): Rect | null {
  const elements = ids
    .map((id) => scene.getElement(id))
    .filter((e): e is Element => !!e && !e.isDeleted);
  if (!elements.length) return null;
  const bounds = elements.map(getElementBounds);
  return {
    minX: Math.min(...bounds.map((b) => b.minX)),
    minY: Math.min(...bounds.map((b) => b.minY)),
    maxX: Math.max(...bounds.map((b) => b.maxX)),
    maxY: Math.max(...bounds.map((b) => b.maxY)),
  };
}
export function rectHandleAt(
  b: Rect,
  p: Point,
  zoom: number,
): ResizeHandle | null {
  const nearL = Math.abs(p.x - b.minX) <= 8 / zoom,
    nearR = Math.abs(p.x - b.maxX) <= 8 / zoom;
  const nearT = Math.abs(p.y - b.minY) <= 8 / zoom,
    nearB = Math.abs(p.y - b.maxY) <= 8 / zoom;
  if (nearT && nearL) return "nw";
  if (nearT && nearR) return "ne";
  if (nearB && nearL) return "sw";
  if (nearB && nearR) return "se";
  if (nearT) return "n";
  if (nearB) return "s";
  if (nearL) return "w";
  if (nearR) return "e";
  return null;
}

import type { Element } from "@repo/common";
import type { Bounds } from "./viewport";

export function getElementBounds(element: Element): Bounds {
  const minX = Math.min(element.x, element.x + element.width!);
  const maxX = Math.max(element.x, element.x + element.width!);
  const minY = Math.min(element.y, element.y + element.height!);
  const maxY = Math.max(element.y, element.y + element.height!);
  
  return {
    minX,
    minY,
    maxX,
    maxY,
  };
}

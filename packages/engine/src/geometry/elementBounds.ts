import type { Element } from "@repo/common";
import { Bounds, boundsFromPoints } from "./bounds";

export function getElementLocalBounds(element: Element) {
  switch (element.type) {
    case "rectangle":
    case "ellipse":
    case "diamond":
    case "text":
      return {
        minX: 0,
        maxX: element.width ?? 0,
        minY: 0,
        maxY: element.height ?? 0,
      };
    case "line":
    case "arrow":
    case "freedraw":
      return boundsFromPoints(element.points);
    default: {
      const exhaustiveCheck: never = element;
      return exhaustiveCheck;
    }
  }
}

export function getElementAxisAlignedBounds(element: Element): Bounds {
  const local = getElementLocalBounds(element);

  return {
    minX: element.x + local.minX,
    minY: element.y + local.minY,
    maxX: element.x + local.maxX,
    maxY: element.y + local.maxY,
  };
}

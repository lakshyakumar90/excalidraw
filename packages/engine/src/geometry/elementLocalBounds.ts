import type { Element } from "@repo/common";
import { boundsFromPoints, type Bounds } from "./bounds";

export function getElementLocalBounds(element: Element): Bounds {
  switch (element.type) {
    case "frame":
    case "rectangle":
    case "ellipse":
    case "diamond":
    case "text":
    case "image":
      return {
        minX: 0,
        minY: 0,
        maxX: element.width ?? 0,
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

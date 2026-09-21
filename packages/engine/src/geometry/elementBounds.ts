import type { Element } from "@repo/common";
import { type Bounds, boundsFromPoints } from "./bounds";
import { getElementCorners } from "./elementCorners";

export function getElementAxisAlignedBounds(element: Element): Bounds {
  // Single path for all angles: corners are translated when angle is 0 and
  // rotated about the local center otherwise. boundsFromPoints normalizes,
  // so negative width/height also works.
  return boundsFromPoints(getElementCorners(element));
}

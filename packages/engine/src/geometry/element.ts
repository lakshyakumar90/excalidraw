import type { Element } from "@repo/common";
import { getElementAxisAlignedBounds } from "./elementBounds";

export function getElementBounds(element: Element) {
  return getElementAxisAlignedBounds(element);
}

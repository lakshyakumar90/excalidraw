import type { Element } from "@repo/common";
import { boundsIntersect, type Bounds } from "./viewport";
import { getElementBounds } from "./elementBounds";

export function isElementVisible(
  element: Element,
  viewportBounds: Bounds,
): boolean {
  if (element.isDeleted) {
    return false;
  }

  const elementBounds = getElementBounds(element);

  return boundsIntersect(elementBounds, viewportBounds);
}

export function getVisibleElements(
  elements: readonly Element[],
  viewportBounds: Bounds,
): Element[] {
  return elements.filter((element) =>
    isElementVisible(element, viewportBounds),
  );
}

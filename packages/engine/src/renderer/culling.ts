import type { Element } from "@repo/common";
import { boundsIntersect, type Bounds } from "./viewport";
import { getElementBounds } from "../geometry/element";
import { sketchSettings } from "./sketch/settings";

export function isElementVisible(
  element: Element,
  viewportBounds: Bounds,
): boolean {
  if (element.isDeleted) {
    return false;
  }

  const bounds = getElementBounds(element);
  const settings = sketchSettings(element.roughness);
  const stroke = element.strokeWidth ?? 1;
  const arrowExtra = element.type === "arrow" ? Math.max(10, stroke * 4) : 0;
  const padding = element.type==="frame"?24:
    settings.amplitude + settings.overshoot + stroke / 2 + arrowExtra;
  const elementBounds = {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  };

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

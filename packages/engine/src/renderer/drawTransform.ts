import type { Element } from "@repo/common";
import { getBoundsCenter, getElementLocalBounds } from "../geometry";

export function applyElementTransform(
  context: CanvasRenderingContext2D,
  element: Element,
): void {
  const localBounds = getElementLocalBounds(element);
  const center = getBoundsCenter(localBounds);

  context.translate(element.x + center.x, element.y + center.y);
  context.rotate(element.angle ?? 0);
  context.translate(-center.x, -center.y);
}

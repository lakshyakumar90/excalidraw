import type { Element, Point } from "@repo/common";
import { getElementLocalBounds } from "./elementLocalBounds";
import { rotatePoints } from "./rotation";

export function getElementCorners(element: Element): Point[] {
  const bounds = getElementLocalBounds(element);

  const corners: Point[] = [
    {
      x: bounds.minX,
      y: bounds.minY,
    },
    {
      x: bounds.maxX,
      y: bounds.minY,
    },
    {
      x: bounds.maxX,
      y: bounds.maxY,
    },
    {
      x: bounds.minX,
      y: bounds.maxY,
    },
  ];

  if (element.angle === 0) {
    return corners.map((point) => ({
      x: point.x + element.x,
      y: point.y + element.y,
    }));
  }

  const localCenter: Point = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };

  const rotated = rotatePoints(corners, element.angle ?? 0, localCenter);

  return rotated.map((point) => ({
    x: point.x + element.x,
    y: point.y + element.y,
  }));
}

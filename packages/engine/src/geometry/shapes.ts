import type { Point } from "@repo/common";

export function getEllipseCenter(
  x: number,
  y: number,
  width: number,
  height: number,
): Point {
  return {
    x: x + width / 2,
    y: y + height / 2,
  };
}

export function getDiamondPoints(
  x: number,
  y: number,
  width: number,
  height: number,
): [Point, Point, Point, Point] {
  return [
    {
      x: x + width / 2,
      y,
    },

    {
      x: x + width,
      y: y + height / 2,
    },

    {
      x: x + width / 2,
      y: y + height,
    },

    {
      x,
      y: y + height / 2,
    },
  ];
}

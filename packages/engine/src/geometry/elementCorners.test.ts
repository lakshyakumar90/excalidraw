import { describe, expect, it } from "vitest";
import type { Point } from "@repo/common";
import { rotatePoint } from "./rotation";

describe("rotatePoint", () => {
  it("rotates a point 90 degrees around the origin", () => {
    const point: Point = {
      x: 1,
      y: 0,
    };

    const result = rotatePoint(point, Math.PI / 2, { x: 0, y: 0 });

    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(1);
  });

  it("rotates around a non-origin center", () => {
    const result = rotatePoint({ x: 2, y: 1 }, Math.PI / 2, { x: 1, y: 1 });

    expect(result.x).toBeCloseTo(1);
    expect(result.y).toBeCloseTo(2);
  });

  it("returns the same point for zero rotation", () => {
    const point = {
      x: 10,
      y: 20,
    };

    const result = rotatePoint(point, 0, { x: 5, y: 5 });

    expect(result.x).toBeCloseTo(10);
    expect(result.y).toBeCloseTo(20);
  });
});

import type { ArrowElement } from "@repo/common";
import { describe, expect, it } from "vitest";
import { getArrowHeadPoints, getArrowMidpoint } from "./arrow";

describe("getArrowHeadPoints", () => {
  it("creates an arrowhead for a horizontal line", () => {
    const result = getArrowHeadPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);

    expect(result).not.toBeNull();

    expect(result?.left.x).toBeCloseTo(90);
    expect(result?.right.x).toBeCloseTo(90);
  });

  it("creates an arrowhead for a vertical line", () => {
    const result = getArrowHeadPoints({ x: 0, y: 0 }, { x: 0, y: 100 }, 10);

    expect(result).not.toBeNull();

    expect(result?.left.y).toBeCloseTo(90);
    expect(result?.right.y).toBeCloseTo(90);
  });

  it("returns null for a zero-length line", () => {
    const result = getArrowHeadPoints({ x: 10, y: 10 }, { x: 10, y: 10 }, 10);

    expect(result).toBeNull();
  });
});

describe("getArrowMidpoint", () => {
  it("finds the path-length midpoint and applies the scene offset", () => {
    const arrow: ArrowElement = {
      id: "arrow",
      type: "arrow",
      x: 10,
      y: 20,
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 60 },
      ],
    };

    expect(getArrowMidpoint(arrow)).toEqual({ x: 50, y: 30 });
  });

  it("keeps the midpoint in the arrow's rotated scene coordinates", () => {
    const arrow: ArrowElement = {
      id: "arrow",
      type: "arrow",
      x: 0,
      y: 0,
      angle: Math.PI / 2,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
    };

    const midpoint = getArrowMidpoint(arrow);
    expect(midpoint.x).toBeCloseTo(100);
    expect(midpoint.y).toBeCloseTo(100);
  });
});

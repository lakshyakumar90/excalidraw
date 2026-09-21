import { describe, expect, it } from "vitest";
import { buildStrokeOutline, getStrokeOutlinePath } from "./strokeOutline";

describe("buildStrokeOutline", () => {
  it("creates both sides of a horizontal stroke", () => {
    const points = [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 100, y: 0, pressure: 0.5 },
    ];
    const result = buildStrokeOutline(points, 2);
    expect(result.left).toHaveLength(2);
    expect(result.right).toHaveLength(2);
    expect(result.left[0]?.y).toBeGreaterThan(0);
    expect(result.right[0]?.y).toBeLessThan(0);
  });

  it("makes heavier pressure wider", () => {
    const points = [
      { x: 0, y: 0, pressure: 0 },
      { x: 100, y: 0, pressure: 1 },
    ];
    const result = buildStrokeOutline(points, 2);
    const lightWidth = Math.abs(
      (result.left[0]?.y ?? 0) - (result.right[0]?.y ?? 0),
    );
    const heavyWidth = Math.abs(
      (result.left[1]?.y ?? 0) - (result.right[1]?.y ?? 0),
    );
    expect(heavyWidth).toBeGreaterThan(lightWidth);
  });

  it("handles an empty stroke", () => {
    expect(buildStrokeOutline([], 2)).toEqual({ left: [], right: [] });
  });

  it("builds a closed path from the outline", () => {
    const outline = buildStrokeOutline(
      [
        { x: 0, y: 0, pressure: 0.5 },
        { x: 100, y: 0, pressure: 0.5 },
      ],
      2,
    );
    const path = getStrokeOutlinePath(outline);
    expect(path).toHaveLength(4);
  });
});

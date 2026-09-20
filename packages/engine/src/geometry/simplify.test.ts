import { describe, expect, it } from "vitest";

import { simplifyPoints } from "./simplify";

describe("simplifyPoints", () => {
  it("removes unnecessary points from a straight line", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0.1 },
      { x: 20, y: -0.1 },
      { x: 30, y: 0.05 },
      { x: 40, y: 0 },
    ];

    const result = simplifyPoints(points, 1);

    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ]);
  });

  it("preserves significant bends", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 1 },
      { x: 20, y: 20 },
      { x: 30, y: 40 },
      { x: 40, y: 40 },
    ];

    const result =
      simplifyPoints(points, 1);

    expect(result.length).toBeGreaterThan(2);
  });

  it("handles empty points", () => {
    expect(
      simplifyPoints([], 1),
    ).toEqual([]);
  });

  it("keeps two points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ];

    expect(
      simplifyPoints(points, 1),
    ).toEqual(points);
  });
});


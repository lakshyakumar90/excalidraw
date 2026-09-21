import { describe, expect, it } from "vitest";

import {
  boundsFromPoints,
  createEmptyBounds,
  expandBounds,
  getBoundsCenter,
  getBoundsHeight,
  getBoundsWidth,
  isPointInsideBounds,
} from "./bounds";

describe("bounds", () => {
  it("creates empty bounds", () => {
    expect(createEmptyBounds()).toEqual({
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    });
  });

  it("calculates bounds from points", () => {
    const result = boundsFromPoints([
      { x: 10, y: 20 },
      { x: 100, y: 40 },
      { x: 30, y: -10 },
    ]);

    expect(result).toEqual({
      minX: 10,
      minY: -10,
      maxX: 100,
      maxY: 40,
    });
  });

  it("expands bounds", () => {
    const result = expandBounds(
      {
        minX: 10,
        minY: 10,
        maxX: 20,
        maxY: 20,
      },
      {
        x: 30,
        y: 5,
      },
    );

    expect(result).toEqual({
      minX: 10,
      minY: 5,
      maxX: 30,
      maxY: 20,
    });
  });

  it("calculates dimensions", () => {
    const bounds = {
      minX: 10,
      minY: 20,
      maxX: 110,
      maxY: 70,
    };

    expect(getBoundsWidth(bounds)).toBe(100);

    expect(getBoundsHeight(bounds)).toBe(50);
  });

  it("calculates center", () => {
    const result = getBoundsCenter({
      minX: 10,
      minY: 20,
      maxX: 110,
      maxY: 70,
    });

    expect(result).toEqual({
      x: 60,
      y: 45,
    });
  });

  it("checks point containment", () => {
    const bounds = {
      minX: 10,
      minY: 10,
      maxX: 100,
      maxY: 100,
    };

    expect(isPointInsideBounds({ x: 50, y: 50 }, bounds)).toBe(true);

    expect(isPointInsideBounds({ x: 150, y: 50 }, bounds)).toBe(false);
  });

  it("supports padding", () => {
    const bounds = {
      minX: 10,
      minY: 10,
      maxX: 100,
      maxY: 100,
    };

    expect(isPointInsideBounds({ x: 105, y: 50 }, bounds, 10)).toBe(true);
  });
});

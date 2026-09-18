import { describe, expect, it } from "vitest";

import {
  boundsIntersect,
  pointInBounds,
  sceneBoundsToViewport,
  viewportToSceneBounds,
} from "./viewport";

describe("viewport geometry", () => {
  it("calculates visible scene bounds", () => {
    const bounds = viewportToSceneBounds(
      {
        width: 1000,
        height: 800,
      },
      {
        scrollX: 100,
        scrollY: 50,
        zoom: 2,
      },
    );

    expect(bounds).toEqual({
      minX: -50,
      minY: -25,
      maxX: 450,
      maxY: 375,
    });
  });

  it("converts scene bounds to viewport bounds", () => {
    const bounds = sceneBoundsToViewport(
      {
        minX: -50,
        minY: -25,
        maxX: 450,
        maxY: 375,
      },
      {
        scrollX: 100,
        scrollY: 50,
        zoom: 2,
      },
    );

    expect(bounds).toEqual({
      minX: 0,
      minY: 0,
      maxX: 1000,
      maxY: 800,
    });
  });

  it("checks whether a point is inside bounds", () => {
    const bounds = {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100,
    };

    expect(
      pointInBounds(
        {
          x: 50,
          y: 50,
        },
        bounds,
      ),
    ).toBe(true);

    expect(
      pointInBounds(
        {
          x: 150,
          y: 50,
        },
        bounds,
      ),
    ).toBe(false);
  });

  it("checks whether bounds intersect", () => {
    const first = {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100,
    };

    const second = {
      minX: 50,
      minY: 50,
      maxX: 150,
      maxY: 150,
    };

    const third = {
      minX: 200,
      minY: 200,
      maxX: 300,
      maxY: 300,
    };

    expect(boundsIntersect(first, second)).toBe(true);

    expect(boundsIntersect(first, third)).toBe(false);
  });
});

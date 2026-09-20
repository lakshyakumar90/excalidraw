import { describe, expect, it } from "vitest";

import { getPolylineBounds, toLocalPoints } from "./polyline";

describe("polyline geometry", () => {
  it("calculates bounds for multiple points", () => {
    const points = [
      {
        x: 300,
        y: 200,
      },
      {
        x: 100,
        y: 400,
      },
      {
        x: 500,
        y: 100,
      },
    ];

    expect(getPolylineBounds(points)).toEqual({
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    });
  });

  it("converts points to local coordinates", () => {
    const points = [
      {
        x: 300,
        y: 200,
      },
      {
        x: 100,
        y: 400,
      },
      {
        x: 500,
        y: 100,
      },
    ];

    const bounds = {
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    };

    expect(toLocalPoints(points, bounds)).toEqual([
      {
        x: 200,
        y: 100,
      },
      {
        x: 0,
        y: 300,
      },
      {
        x: 400,
        y: 0,
      },
    ]);
  });
});

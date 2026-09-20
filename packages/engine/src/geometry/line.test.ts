import { describe, expect, it } from "vitest";
import { getLineBounds, getLinePoints } from "./line";

describe("line geometry", () => {
  it("calculates bounds", () => {
    expect(
      getLineBounds(
        {
          x: 100,
          y: 100,
        },
        {
          x: 400,
          y: 300,
        },
      ),
    ).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 200,
    });
  });

  it("normalizes backwards lines", () => {
    const bounds = getLineBounds(
      {
        x: 400,
        y: 300,
      },
      {
        x: 100,
        y: 100,
      },
    );

    expect(bounds).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 200,
    });

    expect(
      getLinePoints(
        {
          x: 400,
          y: 300,
        },
        {
          x: 100,
          y: 100,
        },
        bounds,
      ),
    ).toEqual([
      {
        x: 300,
        y: 200,
      },
      {
        x: 0,
        y: 0,
      },
    ]);
  });
});

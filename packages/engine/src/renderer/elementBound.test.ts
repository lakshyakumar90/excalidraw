import { describe, expect, it } from "vitest";

import { getElementBounds } from "./elementBounds";

import { createRectangleElement } from "../element/factory";

describe("getElementBounds", () => {
  it("calculates normal bounds", () => {
    const element = createRectangleElement({
      x: 100,
      y: 200,
      width: 300,
      height: 150,
    });

    expect(getElementBounds(element)).toEqual({
      minX: 100,
      minY: 200,
      maxX: 400,
      maxY: 350,
    });
  });

  it("handles negative dimensions", () => {
    const element = createRectangleElement({
      x: 400,
      y: 350,
      width: -300,
      height: -150,
    });

    expect(getElementBounds(element)).toEqual({
      minX: 100,
      minY: 200,
      maxX: 400,
      maxY: 350,
    });
  });
});

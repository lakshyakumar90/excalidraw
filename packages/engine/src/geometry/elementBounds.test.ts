import { describe, expect, it } from "vitest";
import { createRectangleElement } from "../element/factory";
import { getElementBounds } from "./element";

describe("getElementBounds", () => {
  it("returns normal bounds when angle is zero", () => {
    const element = createRectangleElement({
      x: 100,
      y: 200,
      width: 200,
      height: 100,
    });

    const bounds = getElementBounds(element);

    expect(bounds).toEqual({
      minX: 100,
      minY: 200,
      maxX: 300,
      maxY: 300,
    });
  });

  it("returns an axis-aligned bounding box for a rotated rectangle", () => {
    const element = createRectangleElement({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });

    element.angle = Math.PI / 2;

    const bounds = getElementBounds(element);

    expect(bounds.minX).toBeCloseTo(25);
    expect(bounds.maxX).toBeCloseTo(75);
    expect(bounds.minY).toBeCloseTo(-25);
    expect(bounds.maxY).toBeCloseTo(75);
  });

  it("handles a 45 degree rotation", () => {
    const element = createRectangleElement({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
  
    element.angle = Math.PI / 4;
  
    const bounds = getElementBounds(element);
  
    const expectedSize = 100 * Math.SQRT2;
  
    expect(bounds.maxX - bounds.minX).toBeCloseTo(expectedSize);
    expect(bounds.maxY - bounds.minY).toBeCloseTo(expectedSize);
  });

  it("handles negative dimensions", () => {
    const element = createRectangleElement({
      x: 400,
      y: 350,
      width: -300,
      height: -150,
    });

    const bounds = getElementBounds(element);

    expect(bounds).toEqual({
      minX: 100,
      minY: 200,
      maxX: 400,
      maxY: 350,
    });
  });
});

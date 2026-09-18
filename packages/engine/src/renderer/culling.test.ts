import { describe, expect, it } from "vitest";

import { createRectangleElement } from "../element/factory";

import { getVisibleElements, isElementVisible } from "./culling";

describe("element culling", () => {
  const viewportBounds = {
    minX: 0,
    minY: 0,
    maxX: 1000,
    maxY: 800,
  };

  it("detects visible elements", () => {
    const element = createRectangleElement({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });

    expect(isElementVisible(element, viewportBounds)).toBe(true);
  });

  it("detects elements outside viewport", () => {
    const element = createRectangleElement({
      x: 2000,
      y: 2000,
      width: 100,
      height: 100,
    });

    expect(isElementVisible(element, viewportBounds)).toBe(false);
  });

  it("filters visible elements", () => {
    const visible = createRectangleElement({
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    const outside = createRectangleElement({
      x: 2000,
      y: 2000,
      width: 100,
      height: 100,
    });

    const elements = [visible, outside];

    expect(getVisibleElements(elements, viewportBounds)).toEqual([visible]);
  });

  it("filters deleted elements", () => {
    const element = createRectangleElement({
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    element.isDeleted = true;

    expect(isElementVisible(element, viewportBounds)).toBe(false);
  });
});

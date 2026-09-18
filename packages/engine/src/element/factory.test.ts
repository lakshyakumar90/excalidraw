import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createRectangleElement,
} from "./factory";

describe("createRectangleElement", () => {
  it("creates a rectangle with valid defaults", () => {
    const element =
      createRectangleElement({
        id: "1",
        type: "rectangle",
        x: 100,
        y: 200,
        width: 300,
        height: 150,
      });

    expect(element.type)
      .toBe("rectangle");

    expect(element.x)
      .toBe(100);

    expect(element.y)
      .toBe(200);

    expect(element.width)
      .toBe(300);

    expect(element.height)
      .toBe(150);

    expect(element.version)
      .toBe(1);

    expect(element.isDeleted)
      .toBe(false);

    expect(element.groupIds)
      .toEqual([]);

    expect(element.boundElements)
      .toEqual([]);

    expect(element.frameId)
      .toBeNull();
  });
});
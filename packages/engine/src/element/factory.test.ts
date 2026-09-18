import { describe, expect, it } from "vitest";

import { createDiamondElement, createEllipseElement, createRectangleElement } from "./factory";

describe("createRectangleElement", () => {
  it("creates a rectangle with valid defaults", () => {
    const element = createRectangleElement({
      x: 100,
      y: 200,
      width: 300,
      height: 150,
    });

    expect(element.type).toBe("rectangle");

    expect(element.x).toBe(100);

    expect(element.y).toBe(200);

    expect(element.width).toBe(300);

    expect(element.height).toBe(150);

    expect(element.version).toBe(1);

    expect(element.isDeleted).toBe(false);

    expect(element.groupIds).toEqual([]);

    expect(element.boundElements).toEqual([]);

    expect(element.frameId).toBeNull();
  });

  it("creates an ellipse element", () => {
    const element = createEllipseElement({
      x: 100,
      y: 200,
      width: 300,
      height: 150,
    });

    expect(element).toMatchObject({
      type: "ellipse",
      x: 100,
      y: 200,
      width: 300,
      height: 150,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "none",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      boundElements: [],
      frameId: null,
      version: 1,
      isDeleted: false,
    });
  });

  it("creates a diamond element", () => {
    const element = createDiamondElement({
      x: 100,
      y: 200,
      width: 300,
      height: 150,
    });

    expect(element).toMatchObject({
      type: "diamond",
      x: 100,
      y: 200,
      width: 300,
      height: 150,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "none",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      boundElements: [],
      frameId: null,
      version: 1,
      isDeleted: false,
    });
  });
});

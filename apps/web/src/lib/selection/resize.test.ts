import { describe, expect, it } from "vitest";
import { createRectangleElement } from "@repo/engine";
import { resizeElement } from "./resize";

describe("resizeElement clamps instead of flipping", () => {
  const rectangle = createRectangleElement({
    id: "clamp-rect",
    x: 10,
    y: 20,
    width: 100,
    height: 50,
  });

  it("does not push an east handle past the anchored left edge", () => {
    const resized = resizeElement(
      rectangle,
      "e",
      { x: 5, y: 45 },
      false,
      false,
    );
    expect(resized.x).toBe(10);
    expect(resized.width).toBe(1);
  });

  it("does not push a west handle past the anchored right edge", () => {
    const resized = resizeElement(
      rectangle,
      "w",
      { x: 150, y: 45 },
      false,
      false,
    );
    expect(resized.x! + resized.width!).toBeCloseTo(110, 5);
    expect(resized.width).toBe(1);
  });

  it("keeps south/north handles from inverting vertically", () => {
    const south = resizeElement(
      rectangle,
      "s",
      { x: 60, y: 5 },
      false,
      false,
    );
    expect(south.y).toBe(20);
    expect(south.height).toBe(1);

    const north = resizeElement(
      rectangle,
      "n",
      { x: 60, y: 100 },
      false,
      false,
    );
    expect(north.y! + north.height!).toBeCloseTo(70, 5);
    expect(north.height).toBe(1);
  });

  it("stops growing after the cursor crosses the anchor by a lot", () => {
    for (const distance of [1, 50, 500]) {
      const resized = resizeElement(
        rectangle,
        "e",
        { x: 10 - distance, y: 45 },
        false,
        false,
      );
      expect(resized.width).toBe(1);
      expect(resized.x).toBe(10);
    }
  });

  it("does not grow again when Alt-resizing past the center", () => {
    const resized = resizeElement(
      rectangle,
      "e",
      { x: 0, y: 45 },
      false,
      true,
    );
    expect(resized.width).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { getArrowHeadPoints } from "./arrow";

describe("getArrowHeadPoints", () => {
  it("creates an arrowhead for a horizontal line", () => {
    const result = getArrowHeadPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);

    expect(result).not.toBeNull();

    expect(result?.left.x).toBeCloseTo(90);
    expect(result?.right.x).toBeCloseTo(90);
  });

  it("creates an arrowhead for a vertical line", () => {
    const result = getArrowHeadPoints({ x: 0, y: 0 }, { x: 0, y: 100 }, 10);

    expect(result).not.toBeNull();

    expect(result?.left.y).toBeCloseTo(90);
    expect(result?.right.y).toBeCloseTo(90);
  });

  it("returns null for a zero-length line", () => {
    const result = getArrowHeadPoints({ x: 10, y: 10 }, { x: 10, y: 10 }, 10);

    expect(result).toBeNull();
  });
});

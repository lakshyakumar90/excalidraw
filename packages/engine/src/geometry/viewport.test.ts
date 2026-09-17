import { describe, it, expect } from "vitest";
import { sceneToViewport, viewportToScene } from "./viewport";

describe("viewport transformations", () => {
  const viewport = {
    scrollX: 100,
    scrollY: 50,
    zoom: 2,
  };

  it("converts scene coordinates to viewport coordinates", () => {
    const result = sceneToViewport({ x: 10, y: 20 }, viewport);
    expect(result).toEqual({ x: 120, y: 90 });
  });

  it("converts viewport coordinates back to scene coordinates", () => {
    const result = viewportToScene({ x: 120, y: 90 }, viewport);
    expect(result).toEqual({ x: 10, y: 20 });
  });

  it("round trips correctly", () => {
    const scenePoint = { x: 347.25, y: -128.75 };

    const viewportPoint = sceneToViewport(scenePoint, viewport);
    const result = viewportToScene(viewportPoint, viewport);
    expect(result.x).toBeCloseTo(scenePoint.x);
    expect(result.y).toBeCloseTo(scenePoint.y);
  });
});

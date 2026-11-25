import { describe, expect, it } from "vitest";
import type { Element, FrameElement } from "@repo/common";
import {
  computeSlideViewport,
  cubicBezierEaseInOut,
  extractOrderedSlides,
  reorderSlides,
} from "./slides";

function makeFrame(
  id: string,
  x: number,
  y: number,
  slideOrder?: number,
  title?: string,
): FrameElement {
  return {
    id,
    type: "frame",
    x,
    y,
    width: 1280,
    height: 720,
    angle: 0,
    strokeColor: "#64748B",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    seed: 1,
    version: 1,
    versionNonce: 10,
    isDeleted: false,
    title,
    slideOrder,
  } as unknown as FrameElement;
}

describe("canvas slides engine", () => {
  it("extracts active frames sorted by slideOrder and falls back to spatial position", () => {
    const elements: Element[] = [
      makeFrame("f3", 0, 0, 2, "Architecture"),
      makeFrame("f1", 2000, 0, 0, "Intro"),
      makeFrame("f2", 1000, 0, 1, "Problem"),
    ];
    const slides = extractOrderedSlides(elements);
    expect(slides.map((s) => s.id)).toEqual(["f1", "f2", "f3"]);
    expect(slides[0]!.title).toBe("Intro");
  });

  it("reorders slides cleanly and bumps element versions for multiplayer sync", () => {
    const elements: Element[] = [
      makeFrame("f1", 0, 0, 0, "Slide 1"),
      makeFrame("f2", 1400, 0, 1, "Slide 2"),
      makeFrame("f3", 2800, 0, 2, "Slide 3"),
    ];
    const updated = reorderSlides(elements, ["f3", "f1", "f2"]);
    expect(updated).toHaveLength(3);
    const byId = new Map(updated.map((f) => [f.id, f]));
    expect(byId.get("f3")?.slideOrder).toBe(0);
    expect(byId.get("f1")?.slideOrder).toBe(1);
    expect(byId.get("f2")?.slideOrder).toBe(2);
    expect(byId.get("f3")?.version).toBe(2);
  });

  it("computes centered presentation viewport and smooth cubic-bezier easing", () => {
    const vp = computeSlideViewport(
      { x: 100, y: 50, width: 1280, height: 720 },
      1440,
      900,
      40,
    );
    expect(vp.zoom).toBeGreaterThan(0.5);
    expect(vp.zoom).toBeLessThanOrEqual(1.2);
    expect(cubicBezierEaseInOut(0)).toBe(0);
    expect(cubicBezierEaseInOut(0.5)).toBeCloseTo(0.5, 5);
    expect(cubicBezierEaseInOut(1)).toBe(1);
  });
});

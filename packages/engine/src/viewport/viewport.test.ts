import { describe, expect, it } from "vitest";

import {
  clampZoom,
  zoomAtPoint,
} from "./viewport";
import { viewportToScene } from "../geometry";

describe("clampZoom", () => {
  it("clamps zoom below minimum", () => {
    expect(clampZoom(0.01)).toBe(0.1);
  });

  it("clamps zoom above maximum", () => {
    expect(clampZoom(100)).toBe(30);
  });

  it("keeps valid zoom", () => {
    expect(clampZoom(2)).toBe(2);
  });
});

describe("zoomAtPoint", () => {
  it("keeps the scene point under the cursor", () => {
    const viewport = {
      scrollX: 100,
      scrollY: 50,
      zoom: 1,
    };

    const cursor = {
      x: 500,
      y: 300,
    };

    const next = zoomAtPoint(
      viewport,
      cursor,
      2,
    );

    const sceneX =
      (cursor.x - viewport.scrollX) /
      viewport.zoom;

    const sceneY =
      (cursor.y - viewport.scrollY) /
      viewport.zoom;

    expect(
      sceneX * next.zoom + next.scrollX,
    ).toBeCloseTo(cursor.x);

    expect(
      sceneY * next.zoom + next.scrollY,
    ).toBeCloseTo(cursor.y);
  });

  it("preserves the scene point under the cursor", () => {
    const viewport = {
      scrollX: 100,
      scrollY: 50,
      zoom: 1,
    };
  
    const cursor = {
      x: 500,
      y: 300,
    };
  
    const before = viewportToScene(
      cursor,
      viewport,
    );
  
    const next = zoomAtPoint(
      viewport,
      cursor,
      2,
    );
  
    const after = viewportToScene(
      cursor,
      next,
    );
  
    expect(after.x).toBeCloseTo(
      before.x,
    );
  
    expect(after.y).toBeCloseTo(
      before.y,
    );
  });
});
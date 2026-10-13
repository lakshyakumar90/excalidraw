import { describe, expect, it, vi } from "vitest";
import { sceneToViewport, viewportToScene } from "@repo/engine";
import { sizeCanvas } from "./sizeCanvas";

describe("responsive canvas coordinates", () => {
  it("resizes backing pixels without locking the CSS dimensions after rotation", () => {
    const canvas = { width: 0, height: 0, style: {} } as HTMLCanvasElement;
    const setTransform = vi.fn();
    const context = { setTransform } as unknown as CanvasRenderingContext2D;
    sizeCanvas(canvas, context, { width: 390, height: 844 }, 3);
    expect([canvas.width, canvas.height]).toEqual([1170, 2532]);
    sizeCanvas(canvas, context, { width: 844, height: 390 }, 3);
    expect([canvas.width, canvas.height]).toEqual([2532, 1170]);
    expect(canvas.style).toEqual({ width: "100%", height: "100%" });
    expect(setTransform).toHaveBeenLastCalledWith(3, 0, 0, 3, 0, 0);
  });

  it.each([1, 1.25, 2, 3])("preserves nested element positions at DPR %s", (dpr) => {
    const canvas = { width: 0, height: 0, style: {} } as HTMLCanvasElement;
    let transform: number[] = [];
    const context = { setTransform: (...args: number[]) => { transform = args; } } as unknown as CanvasRenderingContext2D;
    const viewport = { scrollX: -20, scrollY: 30, zoom: 1.5 };
    const outer = { x: 60, y: 50 };
    const inner = { x: 85, y: 80 };
    for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      sizeCanvas(canvas, context, size, dpr);
      const cssPoint = sceneToViewport(inner, viewport);
      // CSS presentation undoes backing resolution; input remains in CSS pixels.
      const displayed = { x: cssPoint.x * transform[0]! * size.width / canvas.width, y: cssPoint.y * transform[3]! * size.height / canvas.height };
      const restored = viewportToScene(displayed, viewport);
      expect(restored.x - outer.x).toBeCloseTo(25);
      expect(restored.y - outer.y).toBeCloseTo(30);
    }
  });
});

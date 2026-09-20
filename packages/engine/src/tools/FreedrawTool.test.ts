import { describe, expect, it } from "vitest";
import { FreedrawTool } from "./FreedrawTool";

function pointer(x: number, y: number, button = 0, pressure = 0.5) {
  return { point: { x, y }, button, shiftKey: false, pointerId: 1, pressure };
}

describe("FreedrawTool", () => {
  it("records hand movement as a freedraw element", () => {
    const tool = new FreedrawTool();
    tool.onPointerDown(pointer(0, 0));
    tool.onPointerMove(pointer(50, 30));
    tool.onPointerMove(pointer(100, 60));
    const result = tool.onPointerUp(pointer(160, 160));
    expect(result.committedElement?.type).toBe("freedraw");
    expect((result.committedElement as any)?.points.length).toBeGreaterThan(2);
  });

  it("ignores points that are too close", () => {
    const tool = new FreedrawTool();
    tool.onPointerDown(pointer(0, 0));
    tool.onPointerMove(pointer(10, 0));
    tool.onPointerMove(pointer(11, 0));
    const result = tool.onPointerUp(pointer(50, 50));
    expect((result.committedElement as any)?.points.length).toBe(3);
  });

  it("records per-point pressure", () => {
    const tool = new FreedrawTool();
    tool.onPointerDown(pointer(0, 0, 0, 0.2));
    tool.onPointerMove(pointer(50, 0, 0, 0.9));
    const result = tool.onPointerUp(pointer(100, 0, 0, 0.8));
    const points = (result.committedElement as any)?.points;
    expect(points[0]?.pressure).toBeCloseTo(0.2);
    expect(points[points.length - 1]?.pressure).toBeCloseTo(0.8);
  });
});

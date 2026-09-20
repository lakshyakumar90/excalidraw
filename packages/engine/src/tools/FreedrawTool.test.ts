import { describe, expect, it } from "vitest";
import { FreedrawTool } from "./FreedrawTool";

function pointer(x: number, y: number, button = 0) {
  return { point: { x, y }, button, shiftKey: false, pointerId: 1 };
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
});

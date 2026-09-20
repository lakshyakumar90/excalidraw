import { describe, expect, it } from "vitest";
import { CurvedLineTool } from "./CurvedLineTool";

function pointer(x: number, y: number, button = 0) {
  return { point: { x, y }, button, shiftKey: false, pointerId: 1 };
}

describe("CurvedLineTool", () => {
  it("commits a curved line with multiple points", () => {
    const tool = new CurvedLineTool();
    tool.onPointerDown(pointer(0, 0));
    tool.onPointerMove(pointer(50, 30));
    tool.onPointerMove(pointer(100, 60));
    tool.onPointerMove(pointer(150, 150));
    const result = tool.onPointerUp(pointer(160, 160));
    expect(result.committedElement?.type).toBe("line");
    expect((result.committedElement as any)?.lineType).toBe("curved");
    expect((result.committedElement as any)?.points.length).toBeGreaterThan(2);
    expect(tool.isDrawing).toBe(false);
  });

  it("does not commit on very short movement", () => {
    const tool = new CurvedLineTool();
    tool.onPointerDown(pointer(0, 0));
    const result = tool.onPointerUp(pointer(0, 0));
    expect(result.committedElement).toBeNull();
  });

  it("cancel clears state", () => {
    const tool = new CurvedLineTool();
    tool.onPointerDown(pointer(0, 0));
    tool.onPointerMove(pointer(50, 50));
    const result = tool.cancel();
    expect(result.previewElement).toBeNull();
    expect(result.committedElement).toBeNull();
    expect(tool.isDrawing).toBe(false);
  });

  it("normalizes bounding box when drawn backwards", () => {
    const tool = new CurvedLineTool();
    tool.onPointerDown(pointer(150, 150));
    tool.onPointerMove(pointer(50, 50));
    tool.onPointerMove(pointer(0, 0));
    const result = tool.onPointerUp(pointer(0, 0));
    const el = result.committedElement as any;
    expect(el.width).toBeGreaterThanOrEqual(0);
    expect(el.height).toBeGreaterThanOrEqual(0);
  });
});

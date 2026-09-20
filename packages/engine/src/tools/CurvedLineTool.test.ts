import { describe, expect, it } from "vitest";
import { CurvedLineTool } from "./CurvedLineTool";

function pointer(x: number, y: number, button = 0) {
  return { point: { x, y }, button, shiftKey: false, pointerId: 1 };
}

describe("CurvedLineTool", () => {
  it("creates a curved line via chord + bend + click", () => {
    const tool = new CurvedLineTool();
    tool.onPointerDown(pointer(0, 0));
    tool.onPointerMove(pointer(100, 0));
    const afterChord = tool.onPointerUp(pointer(100, 0));
    expect(tool.isDrawing).toBe(true);
    expect(afterChord.previewElement?.type).toBe("line");

    tool.onPointerMove(pointer(50, 50));
    const result = tool.onPointerDown(pointer(50, 50));
    expect(result.committedElement?.type).toBe("line");
    expect((result.committedElement as any)?.lineType).toBe("curved");
    expect((result.committedElement as any)?.points).toHaveLength(3);
    expect(tool.isDrawing).toBe(false);
  });

  it("does not commit a zero-length chord", () => {
    const tool = new CurvedLineTool();
    tool.onPointerDown(pointer(0, 0));
    const result = tool.onPointerUp(pointer(0, 0));
    expect(result.committedElement).toBeNull();
    expect(tool.isDrawing).toBe(false);
  });

  it("cancel clears state", () => {
    const tool = new CurvedLineTool();
    tool.onPointerDown(pointer(0, 0));
    tool.onPointerMove(pointer(50, 0));
    tool.onPointerUp(pointer(50, 0));
    const result = tool.cancel();
    expect(result.previewElement).toBeNull();
    expect(result.committedElement).toBeNull();
    expect(tool.isDrawing).toBe(false);
  });
});

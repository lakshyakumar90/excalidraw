import { describe, expect, it } from "vitest";

import { MultiPointLineTool } from "./MultiPointLineTool";

function pointer(x: number, y: number) {
  return {
    point: {
      x,
      y,
    },
    shiftKey: false,
    button: 0,
    pointerId: 1,
  };
}

describe("MultiPointLineTool", () => {
  it("starts with one point", () => {
    const tool = new MultiPointLineTool();
    const result = tool.onPointerDown(pointer(100, 100));
    expect(tool.isDrawing).toBe(true);
    expect(tool.pointCount).toBe(1);
    expect(result.previewElement).not.toBeNull();
  });

  it("adds points on click", () => {
    const tool = new MultiPointLineTool();
    tool.onPointerDown(pointer(100, 100));
    tool.onPointerDown(pointer(200, 150));
    expect(tool.pointCount).toBe(2);
    tool.onPointerDown(pointer(300, 100));
    expect(tool.pointCount).toBe(3);
  });

  it("does not commit on pointer up", () => {
    const tool = new MultiPointLineTool();
    tool.onPointerDown(pointer(100, 100));
    tool.onPointerDown(pointer(200, 200));
    const result = tool.onPointerUp(pointer(300, 100));
    expect(result.committedElement).toBeNull();
    expect(tool.isDrawing).toBe(true);
  });

  it("commits with commit()", () => {
    const tool = new MultiPointLineTool();
    tool.onPointerDown(pointer(100, 100));
    tool.onPointerDown(pointer(200, 200));
    tool.onPointerDown(pointer(300, 100));
    const result = tool.commit();
    expect(result.committedElement).toMatchObject({
      type: "line",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      points: [
        {
          x: 0,
          y: 0,
        },
        {
          x: 100,
          y: 100,
        },
        {
          x: 200,
          y: 0,
        },
      ],
    });

    expect(tool.isDrawing).toBe(false);
  });

  it("requires at least two points", () => {
    const tool = new MultiPointLineTool();
    tool.onPointerDown(pointer(100, 100));
    const result = tool.commit();
    expect(result.committedElement).toBeNull();
    expect(tool.isDrawing).toBe(false);
  });

  it("cancels correctly", () => {
    const tool = new MultiPointLineTool();
    tool.onPointerDown(pointer(100, 100));
    tool.onPointerDown(pointer(200, 200));
    const result = tool.cancel();
    expect(result.previewElement).toBeNull();
    expect(result.committedElement).toBeNull();
    expect(tool.isDrawing).toBe(false);
    expect(tool.pointCount).toBe(0);
  });
});

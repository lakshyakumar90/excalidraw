import { describe, expect, it } from "vitest";

import { LineTool } from "./LineTool";

function pointer(
  x: number,
  y: number,
  options: Partial<{
    button: number;
    shiftKey: boolean;
  }> = {},
) {
  return {
    point: {
      x,
      y,
    },

    button: options.button ?? 0,

    shiftKey: options.shiftKey ?? false,

    pointerId: 1,
  };
}

describe("LineTool", () => {
  it("starts drawing", () => {
    const tool = new LineTool();

    const result = tool.onPointerDown(pointer(100, 100));

    expect(tool.isDrawing).toBe(true);

    expect(result.previewElement).toMatchObject({
      type: "line",
      x: 100,
      y: 100,
      width: 0,
      height: 0,
      points: [
        {
          x: 0,
          y: 0,
        },
        {
          x: 0,
          y: 0,
        },
      ],
    });

    expect(result.committedElement).toBeNull();
  });

  it("updates the preview", () => {
    const tool = new LineTool();

    tool.onPointerDown(pointer(100, 100));

    const result = tool.onPointerMove(pointer(300, 200));

    expect(result.previewElement).toMatchObject({
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
          x: 200,
          y: 100,
        },
      ],
    });
  });

  it("normalizes a line drawn backwards", () => {
    const tool = new LineTool();

    tool.onPointerDown(pointer(300, 200));

    const result = tool.onPointerUp(pointer(100, 100));

    expect(result.committedElement).toMatchObject({
      type: "line",

      x: 100,
      y: 100,

      width: 200,
      height: 100,

      points: [
        {
          x: 200,
          y: 100,
        },
        {
          x: 0,
          y: 0,
        },
      ],
    });
  });

  it("commits the line", () => {
    const tool = new LineTool();

    tool.onPointerDown(pointer(100, 100));

    const result = tool.onPointerUp(pointer(400, 300));

    expect(result.committedElement).toMatchObject({
      type: "line",

      x: 100,
      y: 100,

      width: 300,
      height: 200,
    });

    expect(result.committedElement?.type).toBe("line");

    expect(tool.isDrawing).toBe(false);
  });

  it("discards a zero-length line", () => {
    const tool = new LineTool();

    tool.onPointerDown(pointer(100, 100));

    const result = tool.onPointerUp(pointer(100, 100));

    expect(result.committedElement).toBeNull();

    expect(tool.isDrawing).toBe(false);
  });

  it("cancels drawing", () => {
    const tool = new LineTool();

    tool.onPointerDown(pointer(100, 100));

    tool.onPointerMove(pointer(300, 200));

    const result = tool.cancel();

    expect(result.previewElement).toBeNull();

    expect(result.committedElement).toBeNull();

    expect(tool.isDrawing).toBe(false);
  });

  it("ignores non-left pointer down", () => {
    const tool = new LineTool();

    const result = tool.onPointerDown(
      pointer(100, 100, {
        button: 1,
      }),
    );

    expect(result.previewElement).toBeNull();

    expect(tool.isDrawing).toBe(false);
  });
});

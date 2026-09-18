import { describe, expect, it } from "vitest";

import { RectangleTool } from "./RectangleTool";

function pointerEvent(
  x: number,
  y: number,
  options: Partial<{
    shiftKey: boolean;
    button: number;
  }> = {},
) {
  return {
    point: {
      x,
      y,
    },
    shiftKey: options.shiftKey ?? false,
    button: options.button ?? 0,
    pointerId: 1,
  };
}

describe("RectangleTool", () => {
  it("starts drawing on pointer down", () => {
    const tool = new RectangleTool();

    const result = tool.onPointerDown(pointerEvent(100, 100));

    expect(result.previewElement).not.toBeNull();

    expect(result.committedElement).toBeNull();

    expect(tool.isDrawing).toBe(true);
  });

  it("updates preview while drawing", () => {
    const tool = new RectangleTool();

    tool.onPointerDown(pointerEvent(100, 100));

    const result = tool.onPointerMove(pointerEvent(300, 250));

    expect(result.previewElement).toMatchObject({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 150,
    });

    expect(result.committedElement).toBeNull();
  });

  it("creates a normalized rectangle", () => {
    const tool = new RectangleTool();

    tool.onPointerDown(pointerEvent(300, 250));

    const result = tool.onPointerUp(pointerEvent(100, 100));

    expect(result.committedElement).toMatchObject({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 150,
    });
  });

  it("creates a square with shift", () => {
    const tool = new RectangleTool();

    tool.onPointerDown(pointerEvent(100, 100));

    const result = tool.onPointerUp(
      pointerEvent(300, 200, {
        shiftKey: true,
      }),
    );

    expect(result.committedElement).toMatchObject({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 200,
    });
  });

  it("creates a square correctly when dragging up-left", () => {
    const tool = new RectangleTool();

    tool.onPointerDown(pointerEvent(300, 300));

    const result = tool.onPointerUp(
      pointerEvent(100, 200, {
        shiftKey: true,
      }),
    );

    expect(result.committedElement).toMatchObject({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 200,
    });
  });

  it("discards a degenerate rectangle", () => {
    const tool = new RectangleTool();

    tool.onPointerDown(pointerEvent(100, 100));

    const result = tool.onPointerUp(pointerEvent(100, 100));

    expect(result.committedElement).toBeNull();
  });

  it("ignores non-left pointer down", () => {
    const tool = new RectangleTool();

    const result = tool.onPointerDown(
      pointerEvent(100, 100, {
        button: 1,
      }),
    );

    expect(result.previewElement).toBeNull();

    expect(tool.isDrawing).toBe(false);
  });

  it("cancels drawing", () => {
    const tool = new RectangleTool();

    tool.onPointerDown(pointerEvent(100, 100));

    const result = tool.cancel();

    expect(result.previewElement).toBeNull();

    expect(result.committedElement).toBeNull();

    expect(tool.isDrawing).toBe(false);
  });
});

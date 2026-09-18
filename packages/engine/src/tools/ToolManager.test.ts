import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ToolManager,
} from "./ToolManager";

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
    shiftKey:
      options.shiftKey ?? false,
    button:
      options.button ?? 0,
    pointerId: 1,
  };
}

describe("ToolManager", () => {
  it("starts with rectangle tool", () => {
    const onCommit = vi.fn();

    const manager =
      new ToolManager({
        onCommit,
      });

    expect(
      manager.getActiveTool(),
    ).toBe("rectangle");
  });

  it("creates a preview", () => {
    const onCommit = vi.fn();

    const manager =
      new ToolManager({
        onCommit,
      });

    manager.onPointerDown(
      pointerEvent(100, 100).point,
      pointerEvent(100, 100),
    );

    manager.onPointerMove(
      pointerEvent(300, 200).point,
      pointerEvent(300, 200),
    );

    const preview =
      manager.getPreviewElement();

    expect(preview).not.toBeNull();

    expect(preview).toMatchObject({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });

    expect(
      onCommit,
    ).not.toHaveBeenCalled();
  });

  it("commits the element", () => {
    const onCommit = vi.fn();

    const manager =
      new ToolManager({
        onCommit,
      });

    manager.onPointerDown(
      pointerEvent(100, 100).point,
      pointerEvent(100, 100),
    );

    manager.onPointerUp(
      pointerEvent(300, 200).point,
      pointerEvent(300, 200),
    );

    expect(
      onCommit,
    ).toHaveBeenCalledTimes(1);

    expect(
      onCommit.mock.calls[0][0],
    ).toMatchObject({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
  });

  it("clears preview after commit", () => {
    const manager =
      new ToolManager({
        onCommit: () => {},
      });

    manager.onPointerDown(
      pointerEvent(100, 100).point,
      pointerEvent(100, 100),
    );

    manager.onPointerMove(
      pointerEvent(300, 200).point,
      pointerEvent(300, 200),
    );

    expect(
      manager.getPreviewElement(),
    ).not.toBeNull();

    manager.onPointerUp(
      pointerEvent(300, 200).point,
      pointerEvent(300, 200),
    );

    expect(
      manager.getPreviewElement(),
    ).toBeNull();
  });

  it("cancels the active drawing", () => {
    const manager =
      new ToolManager({
        onCommit: () => {},
      });

    manager.onPointerDown(
      pointerEvent(100, 100).point,
      pointerEvent(100, 100),
    );

    manager.onPointerMove(
      pointerEvent(300, 200).point,
      pointerEvent(300, 200),
    );

    manager.cancel();

    expect(
      manager.getPreviewElement(),
    ).toBeNull();
  });
});
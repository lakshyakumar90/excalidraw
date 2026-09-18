import type { Point } from "@repo/common";
import { createRectangleElement } from "../element";
import type { RectangleElement } from "@repo/common";
import type { Tool, ToolPointerEvent, ToolResult } from "./Tool";

type RectangleToolState =
  | { status: "idle" }
  | {
      status: "drawing";
      startPoint: Point;
      currentPoint: Point;
      shiftKey: boolean;
      preview: RectangleElement;
    };

const MIN_SIZE = 1;

function normalizeRectangle(
  startPoint: Point,
  currentPoint: Point,
  shiftKey: boolean,
): { x: number; y: number; width: number; height: number } {
  let width = currentPoint.x - startPoint.x;
  let height = currentPoint.y - startPoint.y;
  if (shiftKey) {
    const size = Math.max(Math.abs(width), Math.abs(height));
    width = width < 0 ? -size : size;
    height = height < 0 ? -size : size;
  }
  return {
    x: width < 0 ? startPoint.x + width : startPoint.x,
    y: height < 0 ? startPoint.y + height : startPoint.y,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

function createPreview(
  startPoint: Point,
  currentPoint: Point,
  shiftKey: boolean,
): RectangleElement {
  const rectangle = normalizeRectangle(startPoint, currentPoint, shiftKey);
  return createRectangleElement({
    x: rectangle.x,
    y: rectangle.y,
    width: rectangle.width,
    height: rectangle.height,
  });
}

export class RectangleTool implements Tool {
  readonly type = "rectangle";
  private state: RectangleToolState = {
    status: "idle",
  };

  onPointerDown(event: ToolPointerEvent): ToolResult {
    if (event.button !== 0) {
      return {
        previewElement: null,
        committedElement: null,
      };
    }
    const preview = createPreview(event.point, event.point, event.shiftKey);
    this.state = {
      status: "drawing",
      startPoint: event.point,
      currentPoint: event.point,
      shiftKey: event.shiftKey,
      preview,
    };
    return {
      previewElement: preview,
      committedElement: null,
    };
  }

  onPointerMove(event: ToolPointerEvent): ToolResult {
    if (this.state.status !== "drawing") {
      return {
        previewElement: null,
        committedElement: null,
      };
    }

    const preview = createPreview(
      this.state.startPoint,
      event.point,
      event.shiftKey,
    );
    this.state = {
      ...this.state,
      currentPoint: event.point,
      shiftKey: event.shiftKey,
      preview,
    };
    return {
      previewElement: preview,
      committedElement: null,
    };
  }

  onPointerUp(event: ToolPointerEvent): ToolResult {
    if (this.state.status !== "drawing") {
      return {
        previewElement: null,
        committedElement: null,
      };
    }

    const rectangle = normalizeRectangle(
      this.state.startPoint,
      event.point,
      event.shiftKey,
    );
    this.state = {
      status: "idle",
    };

    if (rectangle.width < MIN_SIZE || rectangle.height < MIN_SIZE) {
      return {
        previewElement: null,
        committedElement: null,
      };
    }

    const element = createRectangleElement({
      x: rectangle.x,
      y: rectangle.y,
      width: rectangle.width,
      height: rectangle.height,
    });

    return {
      previewElement: null,
      committedElement: element,
    };
  }

  cancel(): ToolResult {
    this.state = {
      status: "idle",
    };
    return {
      previewElement: null,
      committedElement: null,
    };
  }

  get isDrawing(): boolean {
    return this.state.status === "drawing";
  }
}

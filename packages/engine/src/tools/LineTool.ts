import type { Point, LineElement } from "@repo/common";
import { createLineElement } from "../element/factory";
import { getLineBounds, getLinePoints } from "../geometry";
import type { Tool, ToolPointerEvent, ToolResult } from "./Tool";

type LineToolState =
  | {
      status: "idle";
    }
  | {
      status: "drawing";
      startPoint: Point;
      currentPoint: Point;
      preview: LineElement;
    };

const MIN_LENGTH = 1;

function getDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function createLine(startPoint: Point, endPoint: Point): LineElement {
  const bounds = getLineBounds(startPoint, endPoint);
  const points = getLinePoints(startPoint, endPoint, bounds);

  return createLineElement({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    points,
  });
}

export class LineTool implements Tool {
  readonly type = "line";

  private state: LineToolState = {
    status: "idle",
  };

  onPointerDown(event: ToolPointerEvent): ToolResult {
    if (event.button !== 0) {
      return {
        previewElement: null,
        committedElement: null,
      };
    }

    const preview = createLine(event.point, event.point);

    this.state = {
      status: "drawing",
      startPoint: event.point,
      currentPoint: event.point,
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

    const preview = createLine(this.state.startPoint, event.point);

    this.state = {
      status: "drawing",
      startPoint: this.state.startPoint,
      currentPoint: event.point,
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

    const startPoint = this.state.startPoint;
    const endPoint = event.point;

    this.state = {
      status: "idle",
    };

    if (getDistance(startPoint, endPoint) < MIN_LENGTH) {
      return {
        previewElement: null,
        committedElement: null,
      };
    }

    const element = createLine(startPoint, endPoint);

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

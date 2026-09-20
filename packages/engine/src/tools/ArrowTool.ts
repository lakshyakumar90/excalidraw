import type { ArrowElement, Point } from "@repo/common";
import { createArrowElement } from "../element/factory";
import type { Tool, ToolPointerEvent, ToolResult } from "./Tool";

type ArrowToolState =
  | {
      status: "idle";
    }
  | {
      status: "drawing";
      startPoint: Point;
      currentPoint: Point;
      preview: ArrowElement;
    };

const MIN_LENGTH = 1;

function getDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function getConstrainedEndPoint(
  startPoint: Point,
  endPoint: Point,
  shiftKey: boolean,
): Point {
  if (!shiftKey) {
    return endPoint;
  }

  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;

  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return endPoint;
  }

  const angle = Math.atan2(dy, dx);
  const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);

  return {
    x: startPoint.x + Math.cos(snapAngle) * distance,
    y: startPoint.y + Math.sin(snapAngle) * distance,
  };
}

function createArrow(startPoint: Point, endPoint: Point): ArrowElement {
  return createArrowElement(startPoint, endPoint);
}

export class ArrowTool implements Tool {
  readonly type = "arrow";

  private state: ArrowToolState = {
    status: "idle",
  };

  onPointerDown(event: ToolPointerEvent): ToolResult {
    if (event.button !== 0) {
      return {
        previewElement: null,
        committedElement: null,
      };
    }

    const preview = createArrow(event.point, event.point);

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

    const endPoint = getConstrainedEndPoint(
      this.state.startPoint,
      event.point,
      event.shiftKey,
    );

    const preview = createArrow(this.state.startPoint, endPoint);

    this.state = {
      status: "drawing",
      startPoint: this.state.startPoint,
      currentPoint: endPoint,
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

    const endPoint = getConstrainedEndPoint(
      startPoint,
      event.point,
      event.shiftKey,
    );

    this.state = {
      status: "idle",
    };

    if (getDistance(startPoint, endPoint) < MIN_LENGTH) {
      return {
        previewElement: null,
        committedElement: null,
      };
    }

    const element = createArrow(startPoint, endPoint);

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

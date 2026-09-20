import type { LineElement, Point } from "@repo/common";
import { createLineElementFromPoints } from "../element/factory";
import type { Tool, ToolPointerEvent, ToolResult } from "./Tool";

type CurvedLineToolState =
  | {
      status: "idle";
    }
  | {
      status: "drawing";
      points: Point[];
      preview: LineElement | null;
    };

const MIN_POINT_DISTANCE = 3;

export class CurvedLineTool implements Tool {
  readonly type = "curved-line";

  private state: CurvedLineToolState = {
    status: "idle",
  };

  onPointerDown(event: ToolPointerEvent): ToolResult {
    if (event.button !== 0) {
      return {
        previewElement: null,
        committedElement: null,
      };
    }

    const points = [event.point];

    this.state = {
      status: "drawing",
      points,
      preview: null,
    };

    return {
      previewElement: null,
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

    const points = this.state.points;
    const lastPoint = points[points.length - 1];

    if (!lastPoint) {
      return {
        previewElement: null,
        committedElement: null,
      };
    }

    const dx = event.point.x - lastPoint.x;
    const dy = event.point.y - lastPoint.y;

    const distance = Math.hypot(dx, dy);

    if (distance >= MIN_POINT_DISTANCE) {
      points.push(event.point);
    }

    const preview = this.createPreview(points);

    this.state = {
      status: "drawing",
      points,
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

    const points = this.state.points;

    if (points.length < 2) {
      this.state = {
        status: "idle",
      };

      return {
        previewElement: null,
        committedElement: null,
      };
    }

    const lastPoint = points[points.length - 1];

    if (!lastPoint) {
      this.state = {
        status: "idle",
      };

      return {
        previewElement: null,
        committedElement: null,
      };
    }

    if (lastPoint.x !== event.point.x || lastPoint.y !== event.point.y) {
      points.push(event.point);
    }

    const element = this.createPreview(points);

    this.state = {
      status: "idle",
    };

    if (!element) {
      return {
        previewElement: null,
        committedElement: null,
      };
    }

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

  getPreviewElement(): LineElement | null {
    if (this.state.status !== "drawing") {
      return null;
    }

    return this.state.preview;
  }

  get isDrawing(): boolean {
    return this.state.status === "drawing";
  }

  private createPreview(points: readonly Point[]): LineElement | null {
    if (points.length < 2) {
      return null;
    }

    return createLineElementFromPoints([...points], "curved");
  }
}

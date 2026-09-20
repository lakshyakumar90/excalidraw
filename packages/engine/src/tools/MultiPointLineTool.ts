import type { LineElement, Point } from "@repo/common";
import { createPolylineElement } from "../element";
import type { Tool, ToolPointerEvent, ToolResult } from "./Tool";

type MultiPointLineState =
  | {
      status: "idle";
    }
  | {
      status: "drawing";
      points: Point[];
      preview: LineElement;
    };

const MIN_POINT_DISTANCE = 1;

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function createPreview(points: readonly Point[], cursor: Point): LineElement {
  return createPolylineElement([...points, cursor]);
}

export class MultiPointLineTool implements Tool {
  readonly type = "multi-point-line";

  private state: MultiPointLineState = {
    status: "idle",
  };

  onPointerDown(event: ToolPointerEvent): ToolResult {
    if (event.button !== 0) {
      return {
        previewElement: null,
        committedElement: null,
      };
    }

    if (this.state.status === "idle") {
      const preview = createPreview([event.point], event.point);

      this.state = {
        status: "drawing",
        points: [event.point],
        preview,
      };

      return {
        previewElement: preview,
        committedElement: null,
      };
    }

    const points = this.state.points;
    if (points.length === 0) {
      // handle the empty state
      return {
        previewElement: this.state.preview,
        committedElement: null,
      };
    }

    const lastPoint = points[points.length - 1];

    if (!lastPoint) {
      return {
        previewElement: this.state.preview,
        committedElement: null,
      };
    }
    
    if (distance(lastPoint, event.point) < MIN_POINT_DISTANCE) {
      return {
        previewElement: this.state.preview,
        committedElement: null,
      };
    }

    const nextPoints = [...points, event.point];
    const preview = createPreview(nextPoints, event.point);

    this.state = {
      status: "drawing",
      points: nextPoints,
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

    const preview = createPreview(this.state.points, event.point);

    this.state = {
      status: "drawing",
      points: this.state.points,
      preview,
    };

    return {
      previewElement: preview,
      committedElement: null,
    };
  }

  onPointerUp(_event: ToolPointerEvent): ToolResult {
    /*
     * A normal pointer-up does NOT
     * commit a multi-point line.
     *
     * The line remains active until
     * Enter or double-click.
     */
    return {
      previewElement:
        this.state.status === "drawing" ? this.state.preview : null,
      committedElement: null,
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

  commit(): ToolResult {
    if (this.state.status !== "drawing") {
      return {
        previewElement: null,
        committedElement: null,
      };
    }

    if (this.state.points.length < 2) {
      this.state = {
        status: "idle",
      };

      return {
        previewElement: null,
        committedElement: null,
      };
    }

    const element = createPolylineElement(this.state.points);

    this.state = {
      status: "idle",
    };

    return {
      previewElement: null,
      committedElement: element,
    };
  }

  get isDrawing(): boolean {
    return this.state.status === "drawing";
  }

  get pointCount(): number {
    if (this.state.status === "idle") {
      return 0;
    }
    return this.state.points.length;
  }
}

import type { FreedrawElement, FreedrawPoint } from "@repo/common";
import { createFreedrawElementFromPoints } from "../element/factory";
import { simplifyPoints } from "../geometry/simplify";
import type { Tool, ToolPointerEvent, ToolResult } from "./Tool";
import { normalizePressure } from "../geometry/pressure";

type FreedrawToolState =
  | { status: "idle" }
  | {
      status: "drawing";
      points: FreedrawPoint[];
      preview: FreedrawElement | null;
    };

const MIN_POINT_DISTANCE = 3;
const SIMPLIFY_TOLERANCE = 1.5;

function empty(): ToolResult {
  return { previewElement: null, committedElement: null };
}

export class FreedrawTool implements Tool {
  readonly type = "freedraw";

  private state: FreedrawToolState = { status: "idle" };

  onPointerDown(event: ToolPointerEvent): ToolResult {
    if (event.button !== 0) return empty();
    this.state = {
      status: "drawing",
      points: [
        {
          x: event.point.x,
          y: event.point.y,
          pressure: normalizePressure(event.pressure),
        },
      ],
      preview: null,
    };
    return empty();
  }

  onPointerMove(event: ToolPointerEvent): ToolResult {
    if (this.state.status !== "drawing") return empty();
    const points = this.state.points;
    const last = points[points.length - 1];
    if (!last) return empty();
    if (
      Math.hypot(event.point.x - last.x, event.point.y - last.y) >=
      MIN_POINT_DISTANCE
    ) {
      points.push({
        x: event.point.x,
        y: event.point.y,
        pressure: normalizePressure(event.pressure),
      });
    }
    const preview = this.createPreview(points);
    this.state = { status: "drawing", points, preview };
    return { previewElement: preview, committedElement: null };
  }

  onPointerUp(event: ToolPointerEvent): ToolResult {
    if (this.state.status !== "drawing") {
      return empty();
    }

    const points = this.state.points;

    if (points.length < 2) {
      this.state = {
        status: "idle",
      };

      return empty();
    }

    const last = points[points.length - 1];

    if (last && (last.x !== event.point.x || last.y !== event.point.y)) {
      points.push({
        x: event.point.x,
        y: event.point.y,
        pressure: normalizePressure(event.pressure),
      });
    }

    const simplifiedPoints = simplifyPoints(points, SIMPLIFY_TOLERANCE);

    if (simplifiedPoints.length < 2) {
      this.state = {
        status: "idle",
      };

      return empty();
    }

    const element = this.createPreview(simplifiedPoints);

    this.state = {
      status: "idle",
    };

    if (!element) {
      return empty();
    }

    return {
      previewElement: null,
      committedElement: element,
    };
  }

  cancel(): ToolResult {
    this.state = { status: "idle" };
    return empty();
  }

  get isDrawing(): boolean {
    return this.state.status === "drawing";
  }

  private createPreview(points: readonly FreedrawPoint[]): FreedrawElement | null {
    if (points.length < 2) return null;
    return createFreedrawElementFromPoints([...points]);
  }
}

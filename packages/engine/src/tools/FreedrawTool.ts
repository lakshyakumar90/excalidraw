import type { FreedrawElement, FreedrawPoint, Point } from "@repo/common";
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

const MIN_POINT_DISTANCE = 1.25;
const SIMPLIFY_TOLERANCE = 0.8;

function empty(): ToolResult {
  return { previewElement: null, committedElement: null };
}

/** Light three-sample smoothing that keeps the stroke endpoints in place. */
function smoothPoints(points: readonly FreedrawPoint[]): FreedrawPoint[] {
  if (points.length < 3) return [...points];
  const result: FreedrawPoint[] = [points[0]!];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    result.push({
      x: (previous.x + 2 * current.x + next.x) / 4,
      y: (previous.y + 2 * current.y + next.y) / 4,
      pressure:
        (previous.pressure + 2 * current.pressure + next.pressure) / 4,
    });
  }
  result.push(points[points.length - 1]!);
  return result;
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
    for (const sample of event.coalescedPoints ?? []) {
      this.appendPoint(points, sample.point, sample.pressure);
    }
    this.appendPoint(points, event.point, event.pressure);
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

    const simplifiedPoints = simplifyPoints(
      smoothPoints(points),
      SIMPLIFY_TOLERANCE,
    );

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
    return createFreedrawElementFromPoints(smoothPoints(points));
  }

  private appendPoint(
    points: FreedrawPoint[],
    point: Point,
    pressure: number,
  ): void {
    const last = points[points.length - 1];
    if (!last) return;
    if (
      Math.hypot(point.x - last.x, point.y - last.y) < MIN_POINT_DISTANCE
    ) {
      return;
    }
    points.push({
      x: point.x,
      y: point.y,
      pressure: normalizePressure(pressure),
    });
  }
}

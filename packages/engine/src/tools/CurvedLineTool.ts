import type { LineElement, Point } from "@repo/common";
import { createLineElementFromPoints } from "../element/factory";
import type { Tool, ToolPointerEvent, ToolResult } from "./Tool";

// Controlled 3-point curve:
// drag start -> end (chord), release, then move to bend (control point), click to commit.
type CurvedLineToolState =
  | { status: "idle" }
  | { status: "chord"; start: Point; end: Point; preview: LineElement | null }
  | { status: "bending"; start: Point; end: Point; control: Point; preview: LineElement | null };

const MIN_SIZE = 1;

function empty(): ToolResult {
  return { previewElement: null, committedElement: null };
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export class CurvedLineTool implements Tool {
  readonly type = "curved-line";

  private state: CurvedLineToolState = { status: "idle" };

  onPointerDown(event: ToolPointerEvent): ToolResult {
    if (event.button !== 0) return empty();

    if (this.state.status === "bending") {
      const { start, end, control } = this.state;
      const element = this.buildElement(start, control, end);
      this.state = { status: "idle" };
      if (!element) return empty();
      return { previewElement: null, committedElement: element };
    }

    this.state = { status: "chord", start: event.point, end: event.point, preview: null };
    return empty();
  }

  onPointerMove(event: ToolPointerEvent): ToolResult {
    if (this.state.status === "chord") {
      const preview = this.buildElement(this.state.start, midpoint(this.state.start, event.point), event.point);
      this.state = { ...this.state, end: event.point, preview };
      return { previewElement: preview, committedElement: null };
    }
    if (this.state.status === "bending") {
      const preview = this.buildElement(this.state.start, event.point, this.state.end);
      this.state = { ...this.state, control: event.point, preview };
      return { previewElement: preview, committedElement: null };
    }
    return empty();
  }

  onPointerUp(event: ToolPointerEvent): ToolResult {
    if (this.state.status !== "chord") return empty();
    const { start } = this.state;
    const end = event.point;
    if (Math.hypot(end.x - start.x, end.y - start.y) < MIN_SIZE) {
      this.state = { status: "idle" };
      return empty();
    }
    const control = midpoint(start, end);
    const preview = this.buildElement(start, control, end);
    this.state = { status: "bending", start, end, control, preview };
    return { previewElement: preview, committedElement: null };
  }

  cancel(): ToolResult {
    this.state = { status: "idle" };
    return empty();
  }

  commit(): ToolResult {
    if (this.state.status !== "bending") return empty();
    const { start, control, end } = this.state;
    const element = this.buildElement(start, control, end);
    this.state = { status: "idle" };
    if (!element) return empty();
    return { previewElement: null, committedElement: element };
  }

  get isDrawing(): boolean {
    return this.state.status !== "idle";
  }

  private buildElement(start: Point, control: Point, end: Point): LineElement | null {
    if (Math.hypot(end.x - start.x, end.y - start.y) < MIN_SIZE) return null;
    return createLineElementFromPoints([start, control, end], "curved");
  }
}

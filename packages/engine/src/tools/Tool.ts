import type { Point } from "@repo/common";
import type { Element } from "@repo/common";

export interface ToolPointerEvent {
  point: Point;
  shiftKey: boolean;
  button: number;
  pointerId: number;
}

export interface ToolResult {
  previewElement: Element | null;
  committedElement: Element | null;
}

export interface Tool {
  readonly type: string;

  onPointerDown(event: ToolPointerEvent): ToolResult;
  onPointerMove(event: ToolPointerEvent): ToolResult;
  onPointerUp(event: ToolPointerEvent): ToolResult;
}


import { RectangleTool } from "./RectangleTool";
import type { Tool, ToolPointerEvent, ToolResult } from "./Tool";

export class FrameTool implements Tool {
  readonly type = "frame";
  private rectangle = new RectangleTool();
  private frame(result: ToolResult): ToolResult {
    const convert = (e: ToolResult["previewElement"]) =>
      e
        ? {
            ...e,
            type: "frame" as const,
            name: "Frame",
            angle: 0,
            roughness: 0,
          }
        : null;
    return {
      previewElement: convert(result.previewElement),
      committedElement: convert(result.committedElement),
    };
  }
  onPointerDown(e: ToolPointerEvent) {
    return this.frame(this.rectangle.onPointerDown(e));
  }
  onPointerMove(e: ToolPointerEvent) {
    return this.frame(this.rectangle.onPointerMove(e));
  }
  onPointerUp(e: ToolPointerEvent) {
    return this.frame(this.rectangle.onPointerUp(e));
  }
  cancel() {
    return this.rectangle.cancel();
  }
  get isDrawing() {
    return this.rectangle.isDrawing;
  }
}

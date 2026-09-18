import type { Element, Point } from "@repo/common";
import type { Tool, ToolPointerEvent, ToolResult } from "./Tool";

export interface ShapeToolConfig<T extends Element> {
  type: string;
  createElement: (options: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => T;
}

type ShapeToolState =
  | {
      status: "idle";
    }
  | {
      status: "drawing";
      startPoint: Point;
      preview: Element;
    };

const MIN_SIZE = 1;

export class ShapeTool<T extends Element> implements Tool {
  readonly type: string;
  private state: ShapeToolState = {
    status: "idle",
  };

  constructor(private readonly config: ShapeToolConfig<T>) {
    this.type = config.type;
  }

  onPointerDown(event: ToolPointerEvent): ToolResult {
    if (event.button !== 0) {
      return {
        previewElement: null,
        committedElement: null,
      };
    }

    const preview = this.createShape(event.point, event.point);

    this.state = {
      status: "drawing",
      startPoint: event.point,
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

    const preview = this.createShape(this.state.startPoint, event.point);

    this.state = {
      status: "drawing",
      startPoint: this.state.startPoint,
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

    const rectangle = this.getNormalizedBounds(
      this.state.startPoint,
      event.point,
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

    const element = this.config.createElement({
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

  private createShape(startPoint: Point, currentPoint: Point): T {
    const bounds = this.getNormalizedBounds(startPoint, currentPoint);
    return this.config.createElement(bounds);
  }

  private getNormalizedBounds(startPoint: Point, currentPoint: Point) {
    const width = currentPoint.x - startPoint.x;
    const height = currentPoint.y - startPoint.y;

    return {
      x: width < 0 ? currentPoint.x : startPoint.x,
      y: height < 0 ? currentPoint.y : startPoint.y,
      width: Math.abs(width),
      height: Math.abs(height),
    };
  }
}

import type { Element, Point } from "@repo/common";
import { RectangleTool } from "./RectangleTool";
import type { Tool, ToolPointerEvent } from "./Tool";

export type ToolType = "selection" | "rectangle";

export interface ToolManagerOptions {
  onCommit: (element: Element) => void;
}

export class ToolManager {
  private readonly tools: Map<ToolType, Tool>;
  private activeToolType: ToolType = "rectangle";
  private previewElement: Element | null = null;
  private readonly onCommit: (element: Element) => void;
  private readonly subscribers = new Set<() => void>();

  constructor(options: ToolManagerOptions) {
    this.tools = new Map([["rectangle", new RectangleTool()]]);
    this.onCommit = options.onCommit;
  }

  setActiveTool(type: ToolType): void {
    if (this.activeToolType === type) {
      return;
    }

    const tool = this.tools.get(this.activeToolType);

    if (tool) {
      const result = tool.cancel();
      this.previewElement = result.previewElement;
    }

    this.activeToolType = type;
    this.notify();
  }
  
  getActiveTool(): ToolType {
    return this.activeToolType;
  }

  getPreviewElement(): Element | null {
    return this.previewElement;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.subscribers.add(listener);

    return () => {
      this.subscribers.delete(listener);
    };
  };

  onPointerDown(
    point: Point,
    event: {
      shiftKey: boolean;
      button: number;
      pointerId: number;
    },
  ): void {
    const tool = this.tools.get(this.activeToolType);

    if (!tool) {
      return;
    }

    const toolEvent: ToolPointerEvent = {
      point,
      shiftKey: event.shiftKey,
      button: event.button,
      pointerId: event.pointerId,
    };

    const result = tool.onPointerDown(toolEvent);
    this.applyResult(result);
  }

  onPointerMove(
    point: Point,
    event: {
      shiftKey: boolean;
      button: number;
      pointerId: number;
    },
  ): void {
    const tool = this.tools.get(this.activeToolType);

    if (!tool) {
      return;
    }

    const toolEvent: ToolPointerEvent = {
      point,
      shiftKey: event.shiftKey,
      button: event.button,
      pointerId: event.pointerId,
    };

    const result = tool.onPointerMove(toolEvent);
    this.applyResult(result);
  }

  onPointerUp(
    point: Point,
    event: {
      shiftKey: boolean;
      button: number;
      pointerId: number;
    },
  ): void {
    const tool = this.tools.get(this.activeToolType);

    if (!tool) {
      return;
    }

    const toolEvent: ToolPointerEvent = {
      point,
      shiftKey: event.shiftKey,
      button: event.button,
      pointerId: event.pointerId,
    };

    const result = tool.onPointerUp(toolEvent);
    this.applyResult(result);
  }

  cancel(): void {
    const tool = this.tools.get(this.activeToolType);

    if (!tool) {
      this.previewElement = null;
      return;
    }

    const result = tool.cancel();
    this.applyResult(result);
  }

  get isDrawing(): boolean {
    const tool = this.tools.get(this.activeToolType);

    if (!tool) {
      return false;
    }

    if ("isDrawing" in tool) {
      return Boolean(
        (
          tool as Tool & {
            isDrawing: boolean;
          }
        ).isDrawing,
      );
    }

    return false;
  }

  private applyResult(result: {
    previewElement: Element | null;
    committedElement: Element | null;
  }): void {
    this.previewElement = result.previewElement;

    if (result.committedElement) {
      this.onCommit(result.committedElement);
    }

    this.notify();
  }

  private notify(): void {
    for (const listener of this.subscribers) {
      listener();
    }
  }
}

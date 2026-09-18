import type { RenderState } from "./renderState";

export interface RenderLoopCallbacks {
  renderStatic: () => void;
  renderInteractive: () => void;
}

export interface FrameScheduler {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
}

export class RenderLoop {
  private animationFrame: number | null = null;
  private running = false;

  constructor(
    private readonly state: RenderState,
    private readonly callbacks: RenderLoopCallbacks,
    private readonly scheduler: FrameScheduler,
  ) {}

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.scheduleNextFrame();
  }

  stop(): void {
    this.running = false;

    if (this.animationFrame !== null) {
      this.scheduler.cancelFrame(this.animationFrame);

      this.animationFrame = null;
    }
  }

  invalidateStatic(): void {
    this.state.staticDirty = true;
  }

  invalidateInteractive(): void {
    this.state.interactiveDirty = true;
  }

  invalidateAll(): void {
    this.state.staticDirty = true;
    this.state.interactiveDirty = true;
  }

  private scheduleNextFrame(): void {
    if (!this.running) {
      return;
    }

    this.animationFrame = this.scheduler.requestFrame(() => {
      this.renderFrame();
    });
  }

  private renderFrame(): void {
    if (!this.running) {
      return;
    }

    this.animationFrame = null;

    if (this.state.staticDirty) {
      this.callbacks.renderStatic();
      this.state.staticDirty = false;
    }

    this.callbacks.renderInteractive();
    this.state.interactiveDirty = false;
    this.scheduleNextFrame();
  }
}

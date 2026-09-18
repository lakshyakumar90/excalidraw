import type { RenderState } from "./renderState";

export interface RenderLoopCallbacks {
  renderStatic: () => void;
  renderInteractive: () => void;
}

export interface FrameScheduler {
  requestFrame: (callback: FrameRequestCallback) => number;

  cancelFrame: (handle: number) => void;
}

export interface RenderLoopStats {
  fps: number;
  frameCount: number;
  staticRenderCount: number;
  interactiveRenderCount: number;
}

export class RenderLoop {
  private animationFrame: number | null = null;
  private running = false;
  private frameCount = 0;
  private staticRenderCount = 0;
  private interactiveRenderCount = 0;
  private fps = 0;
  private lastFpsTimestamp: number | null = null;
  private framesSinceLastFpsUpdate = 0;

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
    this.lastFpsTimestamp = null;
    this.framesSinceLastFpsUpdate = 0;
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

  getStats(): RenderLoopStats {
    return {
      fps: this.fps,
      frameCount: this.frameCount,
      staticRenderCount: this.staticRenderCount,
      interactiveRenderCount: this.interactiveRenderCount,
    };
  }

  private scheduleNextFrame(): void {
    if (!this.running) {
      return;
    }

    this.animationFrame = this.scheduler.requestFrame((timestamp) => {
      this.renderFrame(timestamp);
    });
  }

  private renderFrame(timestamp: number): void {
    if (!this.running) {
      return;
    }

    this.animationFrame = null;
    this.frameCount += 1;
    this.framesSinceLastFpsUpdate += 1;

    this.updateFps(timestamp);

    if (this.state.staticDirty) {
      this.callbacks.renderStatic();
      this.staticRenderCount += 1;
      this.state.staticDirty = false;
    }

    this.callbacks.renderInteractive();
    this.interactiveRenderCount += 1;
    this.state.interactiveDirty = false;
    this.scheduleNextFrame();
  }

  private updateFps(timestamp: number): void {
    if (this.lastFpsTimestamp === null) {
      this.lastFpsTimestamp = timestamp;
      return;
    }

    const elapsed = timestamp - this.lastFpsTimestamp;

    if (elapsed < 1000) {
      return;
    }

    this.fps = (this.framesSinceLastFpsUpdate / elapsed) * 1000;
    this.framesSinceLastFpsUpdate = 0;
    this.lastFpsTimestamp = timestamp;
  }
}

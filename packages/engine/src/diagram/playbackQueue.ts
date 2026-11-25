import type { Element } from "@repo/common";

export interface PlaybackStep {
  title: string;
  elements: Element[];
}

export type PlaybackStatus = "idle" | "playing" | "paused" | "completed" | "cancelled";

export interface TimedPlaybackOptions {
  /** Delay between topological steps in ms (350–600ms recommended). */
  stepDelayMs?: number;
  onRevealStep: (step: PlaybackStep, stepIndex: number, totalSteps: number) => void;
  onStatusChange?: (status: PlaybackStatus) => void;
}

/**
 * Timed Playback Queue giving AI-generated diagrams a "sense of time" by
 * revealing topological build steps sequentially with Pause / Resume / Skip-to-End.
 */
export class TimedPlaybackQueue {
  private steps: PlaybackStep[];
  private cursor = 0;
  private status: PlaybackStatus = "idle";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly stepDelayMs: number;
  private readonly onRevealStep: TimedPlaybackOptions["onRevealStep"];
  private readonly onStatusChange?: TimedPlaybackOptions["onStatusChange"];

  constructor(steps: PlaybackStep[], options: TimedPlaybackOptions) {
    this.steps = [...steps];
    this.stepDelayMs = Math.max(50, Math.min(2000, options.stepDelayMs ?? 450));
    this.onRevealStep = options.onRevealStep;
    this.onStatusChange = options.onStatusChange;
  }

  getStatus(): PlaybackStatus {
    return this.status;
  }

  getProgress(): { current: number; total: number } {
    return { current: this.cursor, total: this.steps.length };
  }

  start(): void {
    if (this.status === "playing") return;
    if (this.cursor >= this.steps.length) {
      this.setStatus("completed");
      return;
    }
    this.setStatus("playing");
    this.emitNext();
  }

  pause(): void {
    if (this.status !== "playing") return;
    this.clearTimer();
    this.setStatus("paused");
  }

  resume(): void {
    if (this.status !== "paused") return;
    this.setStatus("playing");
    this.scheduleNext();
  }

  skipToEnd(): void {
    this.clearTimer();
    while (this.cursor < this.steps.length) {
      const idx = this.cursor;
      const step = this.steps[idx]!;
      this.cursor += 1;
      this.onRevealStep(step, idx, this.steps.length);
    }
    this.setStatus("completed");
  }

  cancel(): void {
    this.clearTimer();
    this.setStatus("cancelled");
  }

  private emitNext(): void {
    if (this.status !== "playing") return;
    if (this.cursor >= this.steps.length) {
      this.setStatus("completed");
      return;
    }
    const idx = this.cursor;
    const step = this.steps[idx]!;
    this.cursor += 1;
    this.onRevealStep(step, idx, this.steps.length);

    if (this.cursor >= this.steps.length) {
      this.setStatus("completed");
    } else {
      this.scheduleNext();
    }
  }

  private scheduleNext(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.emitNext();
    }, this.stepDelayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setStatus(next: PlaybackStatus): void {
    this.status = next;
    this.onStatusChange?.(next);
  }
}

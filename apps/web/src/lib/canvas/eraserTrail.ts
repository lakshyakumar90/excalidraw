import type { Point } from "@repo/common";
import { sampleCatmullRom } from "@repo/engine";

export interface EraserTrailPoint extends Point {
  time: number;
}

export const ERASER_TRAIL_LIFETIME_MS = 900;
export const ERASER_TRAIL_MAX_POINTS = 160;

export function drawEraserTrail(
  context: CanvasRenderingContext2D,
  points: readonly EraserTrailPoint[],
  cursor: Point | null,
  now: number,
  active: boolean,
): void {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  const visible = points.filter(
    (point) => now - point.time <= ERASER_TRAIL_LIFETIME_MS,
  );
  const newest = visible[visible.length - 1];
  const life = newest
    ? Math.max(0, 1 - (now - newest.time) / ERASER_TRAIL_LIFETIME_MS)
    : 0;
  const fade = life * life;

  if (visible.length >= 2 && fade > 0) {
    const strokeTrail = (
      subset: EraserTrailPoint[],
      width: number,
      alpha: number,
      glow: number,
    ) => {
      if (subset.length < 2) return;
      const smoothed = sampleCatmullRom(
        subset.map((point) => ({ x: point.x, y: point.y })),
        4,
      );
      const first = smoothed[0];
      if (!first) return;
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (let index = 1; index < smoothed.length; index += 1) {
        const point = smoothed[index];
        if (point) context.lineTo(point.x, point.y);
      }
      context.globalAlpha = alpha * fade;
      context.lineWidth = width;
      context.shadowBlur = glow;
      context.stroke();
    };

    // Layered chunks give a soft comet-like fade without drawing each segment
    // as a separate stroke (which made the trail look blocky).
    const chunks = [
      { portion: 1, width: 16, alpha: 0.12, glow: 9 },
      { portion: 0.6, width: 10, alpha: 0.18, glow: 6 },
      { portion: 0.3, width: 5, alpha: 0.5, glow: 0 },
    ];
    for (const chunk of chunks) {
      const start = Math.max(0, visible.length - Math.ceil(visible.length * chunk.portion));
      context.strokeStyle = chunk.glow > 0 ? "#8275ff" : "#7567ed";
      context.shadowColor = "rgba(117, 103, 237, 0.32)";
      strokeTrail(visible.slice(start), chunk.width, chunk.alpha, chunk.glow);
    }
  }

  if (active && cursor) {
    context.globalAlpha = 1;
    context.shadowBlur = 12;
    context.shadowColor = "rgba(91, 77, 220, 0.28)";
    context.fillStyle = "rgba(130, 117, 255, 0.17)";
    context.strokeStyle = "#7567ed";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(cursor.x, cursor.y, 16, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  context.restore();
}

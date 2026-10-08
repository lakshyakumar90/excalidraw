import type { Point } from "@repo/common";

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
  context.lineCap = "butt";
  context.lineJoin = "round";

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (!previous || !current) continue;

    const age = Math.max(0, now - current.time);
    const life = Math.max(0, 1 - age / ERASER_TRAIL_LIFETIME_MS);
    if (life <= 0) continue;
    const fade = life * life;
    const start =
      index === 1
        ? previous
        : {
            x: (previous.x + current.x) / 2,
            y: (previous.y + current.y) / 2,
          };
    const end = next
      ? { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 }
      : current;

    context.beginPath();
    context.moveTo(start.x, start.y);
    if (next) context.quadraticCurveTo(current.x, current.y, end.x, end.y);
    else context.lineTo(end.x, end.y);
    context.strokeStyle = "#8275ff";
    context.shadowColor = "rgba(117, 103, 237, 0.32)";
    context.shadowBlur = 9;
    context.lineWidth = 15;
    context.globalAlpha = 0.16 * fade;
    context.stroke();
    context.shadowBlur = 0;
    context.strokeStyle = "#7567ed";
    context.lineWidth = 6;
    context.globalAlpha = 0.52 * fade;
    context.stroke();
  }

  if (active && cursor) {
    context.lineCap = "round";
    context.globalAlpha = 1;
    context.shadowColor = "rgba(91, 77, 220, 0.28)";
    context.shadowBlur = 12;
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

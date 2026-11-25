"use client";
import { useEffect, useRef } from "react";
import { clearLaser, laserTrails, subscribeLaser } from "@/lib/presence/laser";
import { getCurrentViewport } from "@/lib/persistence/viewportStore";
import { colorForUserId } from "@/lib/presence/colors";
import { sampleCatmullRom } from "@repo/engine";

export function LaserOverlay() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = 0;
      const c = canvas.current;
      if (!c) return;
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(window.innerWidth * ratio),
        height = Math.round(window.innerHeight * ratio);
      if (c.width !== width || c.height !== height) {
        c.width = width;
        c.height = height;
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const now = performance.now();
      laserTrails.prune(now);
      const v = getCurrentViewport(),
        reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      for (const trail of laserTrails.trails.values()) {
        ctx.strokeStyle =
          trail.userId === "local" ? "#e03131" : colorForUserId(trail.userId);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        if (reduced) {
          const p = trail.points.at(-1)!;
          ctx.beginPath();
          ctx.arc(
            p.x * v.zoom + v.scrollX,
            p.y * v.zoom + v.scrollY,
            4,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          continue;
        }
        const screenPoints = trail.points.map((point) => ({
          x: point.x * v.zoom + v.scrollX,
          y: point.y * v.zoom + v.scrollY,
        }));
        const smoothed = sampleCatmullRom(screenPoints, 4);
        const samplesPerSegment = 4;
        const times: number[] = [];
        if (trail.points.length === 2) {
          times.push(trail.points[0]!.time, trail.points[1]!.time);
        }
        for (let i = 0; i < trail.points.length - 1; i++) {
          const from = trail.points[i]!.time;
          const to = trail.points[i + 1]!.time;
          for (let step = 0; step < samplesPerSegment; step++) {
            times.push(from + ((to - from) * step) / samplesPerSegment);
          }
        }
        times.push(trail.points[trail.points.length - 1]!.time);

        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 8;
        for (let i = 1; i < smoothed.length; i++) {
          const a = smoothed[i - 1]!,
            b = smoothed[i]!;
          ctx.globalAlpha = Math.max(0, 1 - (now - (times[i] ?? 0)) / 1000);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        const p = trail.points.at(-1)!;
        ctx.beginPath();
        ctx.arc(
          p.x * v.zoom + v.scrollX,
          p.y * v.zoom + v.scrollY,
          3,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (laserTrails.trails.size) frame = requestAnimationFrame(tick);
    };
    const unsub = subscribeLaser(() => {
      if (!frame) frame = requestAnimationFrame(tick);
    });
    return () => {
      unsub();
      cancelAnimationFrame(frame);
      clearLaser();
    };
  }, []);
  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 h-full w-full"
    />
  );
}

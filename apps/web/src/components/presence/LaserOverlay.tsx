"use client";
import { useEffect, useRef } from "react";
import { clearLaser, laserTrails, subscribeLaser } from "@/lib/presence/laser";
import { getCurrentViewport } from "@/lib/persistence/viewportStore";
import { colorForUserId } from "@/lib/presence/colors";

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
        for (let i = 1; i < trail.points.length; i++) {
          const a = trail.points[i - 1]!,
            b = trail.points[i]!;
          ctx.globalAlpha = Math.max(0, 1 - (now - a.time) / 1000);
          ctx.beginPath();
          ctx.moveTo(a.x * v.zoom + v.scrollX, a.y * v.zoom + v.scrollY);
          ctx.lineTo(b.x * v.zoom + v.scrollX, b.y * v.zoom + v.scrollY);
          ctx.stroke();
        }
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

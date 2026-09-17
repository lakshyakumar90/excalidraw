"use client";

import { useEffect, useRef } from "react";
import type { Size } from "@repo/common";

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();

      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      draw(ctx, {
        width: rect.width,
        height: rect.height,
      });
    };

    const draw = (
      context: CanvasRenderingContext2D,
      size: Size,
    ) => {
      context.clearRect(
        0,
        0,
        size.width,
        size.height,
      );

      context.fillStyle = "#ffffff";

      context.fillRect(
        0,
        0,
        size.width,
        size.height,
      );
    };

    resize();

    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 block w-screen h-screen touch-none select-none"
    />
  );
}
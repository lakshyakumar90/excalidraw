"use client";

import { useEffect, useRef } from "react";
import type { Size, Point, Viewport } from "@repo/common";
import { viewportToScene, zoomAtPoint } from "@repo/engine";

const INITIAL_VIEWPORT: Viewport = {
  scrollX: 0,
  scrollY: 0,
  zoom: 1,
};

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<Viewport>(INITIAL_VIEWPORT);
  const pointerRef = useRef<Point>({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const lastPointerRef = useRef<Point>({ x: 0, y: 0 });
  const spacePressRef = useRef(false);

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

    const draw = (context: CanvasRenderingContext2D, size: Size) => {
      context.clearRect(0, 0, size.width, size.height);

      context.fillStyle = "#000000";

      context.fillRect(0, 0, size.width, size.height);
    };

    const getPointerPosition = (event: PointerEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const point = getPointerPosition(event);
      pointerRef.current = point;

      if (!isPanningRef.current) {
        return;
      }

      const dx = point.x - lastPointerRef.current.x;
      const dy = point.y - lastPointerRef.current.y;

      const viewport = viewportRef.current;

      viewportRef.current = {
        ...viewport,
        scrollX: viewport.scrollX + dx,
        scrollY: viewport.scrollY + dy,
      };

      lastPointerRef.current = point;

      draw(ctx, {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      });
    };

    // Space + Left Mouse → Pan
    // Middle Mouse       → Pan
    // Normal Left Mouse  → Nothing for now
    const handlePointerDown = (event: PointerEvent) => {
      const isMiddleMouse = event.button === 1;
      const isSpacePan = event.button === 0 && spacePressRef.current;
      if (!isMiddleMouse && !isSpacePan) {
        return;
      }

      event.preventDefault();

      isPanningRef.current = true;
      lastPointerRef.current = getPointerPosition(event);
      canvas.setPointerCapture(event.pointerId);
    };

    const handlePointerUp = (event: PointerEvent) => {
      isPanningRef.current = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spacePressRef.current = true;
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spacePressRef.current = false;
      }
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const cursor = getPointerPosition(event);
      const viewport = viewportRef.current;
      const zoomFactor = Math.exp(-event.deltaY * 0.001);
      const nextZoom = viewport.zoom * zoomFactor;
      viewportRef.current = zoomAtPoint(viewport, cursor, nextZoom);

      draw(ctx, {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      });
    };

    resize();

    window.addEventListener("resize", resize);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 block w-screen h-screen touch-none select-none"
    />
  );
}

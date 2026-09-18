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
  const scenePointerRef = useRef<Point>({ x: 0, y: 0 });
  const fpsRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    lastFpsTimeRef.current = performance.now();

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

      context.fillStyle = "#ffffff";

      context.fillRect(0, 0, size.width, size.height);

      drawGrid(context, size);
      drawOrigin(context);
    };

    const drawGrid = (context: CanvasRenderingContext2D, size: Size) => {
      const viewport = viewportRef.current;
      // const baseGridSize = 20;

      // const gridSize =
      //   viewport.zoom < 0.5
      //     ? baseGridSize * 2
      //     : viewport.zoom < 0.25
      //       ? baseGridSize * 4
      //       : baseGridSize;
      // 
      const gridSize = 20;
      context.save();

      context.translate(viewport.scrollX, viewport.scrollY);
      context.scale(viewport.zoom, viewport.zoom);
      const startX =
        Math.floor(-viewport.scrollX / viewport.zoom / gridSize) * gridSize;
      const startY =
        Math.floor(-viewport.scrollY / viewport.zoom / gridSize) * gridSize;

      const endX = startX + size.width / viewport.zoom + gridSize * 2;
      const endY = startY + size.height / viewport.zoom + gridSize * 2;

      context.beginPath();

      for (let x = startX; x <= endX; x += gridSize) {
        context.moveTo(x, startY);
        context.lineTo(x, endY);
      }

      for (let y = startY; y <= endY; y += gridSize) {
        context.moveTo(startX, y);
        context.lineTo(endX, y);
      }

      context.strokeStyle = "#e5e5e5";
      context.lineWidth = 1 / viewport.zoom;
      context.stroke();
      context.restore();
    };

    const drawOrigin = (context: CanvasRenderingContext2D) => {
      const viewport = viewportRef.current;
      context.save();

      context.translate(viewport.scrollX, viewport.scrollY);
      context.scale(viewport.zoom, viewport.zoom);
      context.beginPath();
      context.moveTo(-30, 0);
      context.lineTo(30, 0);
      context.moveTo(0, -30);
      context.lineTo(0, 30);
      context.strokeStyle = "#737373";
      context.lineWidth = 1 / viewport.zoom;
      context.stroke();
      context.restore();
    };

    const getPointerPosition = (
      event: Pick<MouseEvent, "clientX" | "clientY">,
    ): Point => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const point = getPointerPosition(event);
      pointerRef.current = point;

      const scenePoint = viewportToScene(point, viewportRef.current);
      scenePointerRef.current = scenePoint;

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

      const updatedScenePoint = viewportToScene(point, viewportRef.current);
      scenePointerRef.current = updatedScenePoint;

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

      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      const center: Point = {
        x: canvas.clientWidth / 2,
        y: canvas.clientHeight / 2,
      };

      const viewport = viewportRef.current;

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        viewportRef.current = zoomAtPoint(
          viewport,
          center,
          viewport.zoom * 1.2,
        );
      }

      if (event.key === "-") {
        event.preventDefault();
        viewportRef.current = zoomAtPoint(
          viewport,
          center,
          viewport.zoom / 1.2,
        );
      }

      if (event.key === "0") {
        event.preventDefault();
        viewportRef.current = zoomAtPoint(viewport, center, 1);
      }

      scenePointerRef.current = viewportToScene(
        pointerRef.current,
        viewportRef.current,
      );

      draw(ctx, {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      });
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spacePressRef.current = false;
      }
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const cursor = getPointerPosition(event);
      pointerRef.current = cursor;
      const viewport = viewportRef.current;
      const zoomFactor = Math.exp(-event.deltaY * 0.001);
      const nextZoom = viewport.zoom * zoomFactor;
      viewportRef.current = zoomAtPoint(viewport, cursor, nextZoom);
      scenePointerRef.current = viewportToScene(cursor, viewportRef.current);

      draw(ctx, {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      });
    };

    const updateFps = () => {
      frameCountRef.current += 1;
      const now = performance.now();

      if (lastFpsTimeRef.current === null) {
        lastFpsTimeRef.current = now;
        return;
      }

      const elapsed = now - lastFpsTimeRef.current;
      if (elapsed >= 1000) {
        fpsRef.current = Math.round((frameCountRef.current * 1000) / elapsed);
      }

      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
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

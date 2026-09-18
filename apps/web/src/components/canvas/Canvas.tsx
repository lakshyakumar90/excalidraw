"use client";

import { useEffect, useRef } from "react";
import type { Point, Viewport } from "@repo/common";
import {
  createRenderState,
  RenderLoop,
  renderInteractive,
  renderStatic,
  viewportToScene,
  zoomAtPoint,
} from "@repo/engine";

import { scene } from "@/lib/scene/scene";

const INITIAL_VIEWPORT: Viewport = {
  scrollX: 0,
  scrollY: 0,
  zoom: 1,
};

export function Canvas() {
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const interactiveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<Viewport>(INITIAL_VIEWPORT);
  const pointerRef = useRef<Point>({ x: 0, y: 0 });
  const scenePointerRef = useRef<Point>({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const lastPointerRef = useRef<Point>({ x: 0, y: 0 });
  const spacePressRef = useRef(false);

  useEffect(() => {
    const staticCanvas = staticCanvasRef.current;
    const interactiveCanvas = interactiveCanvasRef.current;

    if (!staticCanvas || !interactiveCanvas) {
      return;
    }

    const staticContext = staticCanvas.getContext("2d");
    const interactiveContext = interactiveCanvas.getContext("2d");

    if (!staticContext || !interactiveContext) {
      return;
    }

    let width = 0;
    let height = 0;

    const renderState = createRenderState();

    const renderLoop = new RenderLoop(
      renderState,
      {
        renderStatic: () => {
          renderStatic(
            {
              context: staticContext,
              width,
              height,
              viewport: viewportRef.current,
            },
            scene.getElements(),
          );
        },

        renderInteractive: () => {
          renderInteractive({
            context: interactiveContext,
            width,
            height,
            viewport: viewportRef.current,
          });
        },
      },
      {
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (handle) => window.cancelAnimationFrame(handle),
      },
    );

    const getPointerPosition = (
      event: Pick<MouseEvent, "clientX" | "clientY">,
    ): Point => {
      const rect = interactiveCanvas.getBoundingClientRect();

      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const resizeCanvas = () => {
      const rect = interactiveCanvas.getBoundingClientRect();

      width = rect.width;
      height = rect.height;

      const dpr = window.devicePixelRatio || 1;
      staticCanvas.width = Math.round(width * dpr);
      staticCanvas.height = Math.round(height * dpr);
      interactiveCanvas.width = Math.round(width * dpr);
      interactiveCanvas.height = Math.round(height * dpr);
      staticCanvas.style.width = `${width}px`;
      staticCanvas.style.height = `${height}px`;
      interactiveCanvas.style.width = `${width}px`;
      interactiveCanvas.style.height = `${height}px`;
      staticContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      interactiveContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderLoop.invalidateAll();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const point = getPointerPosition(event);

      pointerRef.current = point;
      scenePointerRef.current = viewportToScene(point, viewportRef.current);

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
      scenePointerRef.current = viewportToScene(point, viewportRef.current);
      renderLoop.invalidateStatic();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const isMiddleMouse = event.button === 1;
      const isSpacePan = event.button === 0 && spacePressRef.current;

      if (!isMiddleMouse && !isSpacePan) {
        return;
      }

      event.preventDefault();
      isPanningRef.current = true;
      lastPointerRef.current = getPointerPosition(event);
      interactiveCanvas.setPointerCapture(event.pointerId);
    };

    const handlePointerUp = (event: PointerEvent) => {
      isPanningRef.current = false;

      if (interactiveCanvas.hasPointerCapture(event.pointerId)) {
        interactiveCanvas.releasePointerCapture(event.pointerId);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spacePressRef.current = true;
        event.preventDefault();
        return;
      }

      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      const center: Point = {
        x: width / 2,
        y: height / 2,
      };

      const viewport = viewportRef.current;

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();

        viewportRef.current = zoomAtPoint(
          viewport,
          center,
          viewport.zoom * 1.2,
        );

        renderLoop.invalidateStatic();
      }

      if (event.key === "-") {
        event.preventDefault();

        viewportRef.current = zoomAtPoint(
          viewport,
          center,
          viewport.zoom / 1.2,
        );

        renderLoop.invalidateStatic();
      }

      if (event.key === "0") {
        event.preventDefault();

        viewportRef.current = zoomAtPoint(viewport, center, 1);

        renderLoop.invalidateStatic();
      }

      scenePointerRef.current = viewportToScene(
        pointerRef.current,
        viewportRef.current,
      );
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
      renderLoop.invalidateStatic();
    };

    const unsubscribe = scene.subscribe(() => {
      renderLoop.invalidateStatic();
    });

    resizeCanvas();

    window.addEventListener("resize", resizeCanvas);
    interactiveCanvas.addEventListener("pointerdown", handlePointerDown);
    interactiveCanvas.addEventListener("pointermove", handlePointerMove);
    interactiveCanvas.addEventListener("pointerup", handlePointerUp);
    interactiveCanvas.addEventListener("wheel", handleWheel, {
      passive: false,
    });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    renderLoop.start();

    return () => {
      unsubscribe();
      renderLoop.stop();
      window.removeEventListener("resize", resizeCanvas);
      interactiveCanvas.removeEventListener("pointerdown", handlePointerDown);
      interactiveCanvas.removeEventListener("pointermove", handlePointerMove);
      interactiveCanvas.removeEventListener("pointerup", handlePointerUp);
      interactiveCanvas.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden">
      <canvas
        ref={staticCanvasRef}
        className="absolute inset-0 block h-full w-full"
      />

      <canvas
        ref={interactiveCanvasRef}
        className="absolute inset-0 block h-full w-full touch-none select-none"
      />
    </div>
  );
}

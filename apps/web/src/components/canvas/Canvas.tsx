"use client";

import { useEffect, useRef } from "react";
import type { Element, Point, Viewport } from "@repo/common";
import {
  createRenderState,
  RenderLoop,
  renderInteractive,
  renderStatic,
  viewportToScene,
  zoomAtPoint,
} from "@repo/engine";
import { toolManager } from "@/lib/tools/toolManager";
import { renderDiagnostics } from "@/lib/canvas/renderDiagnostics";
import { selectionController } from "@/lib/selection/selectionController";
import { drawSelectionOverlay } from "@/lib/canvas/selectionOverlay";
import { selectionStore } from "@/lib/selection/selectionStore";
import { styleStore } from "@/lib/styles/styleStore";
import { eyedropperStore } from "@/lib/styles/eyedropperStore";
import { colorHistoryStore } from "@/lib/styles/colorHistoryStore";
import { EyedropperOverlay } from "@/components/styles/EyedropperOverlay";

import { scene } from "@/lib/scene/scene";

const INITIAL_VIEWPORT: Viewport = {
  scrollX: 0,
  scrollY: 0,
  zoom: 1,
};

function sampleCanvasColor(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  point: Point,
): string | null {
  const rect = canvas.getBoundingClientRect();
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    point.x < 0 ||
    point.y < 0 ||
    point.x >= rect.width ||
    point.y >= rect.height
  ) {
    return null;
  }

  const pixelX = Math.floor((point.x / rect.width) * canvas.width);
  const pixelY = Math.floor((point.y / rect.height) * canvas.height);

  try {
    const pixel = context.getImageData(pixelX, pixelY, 1, 1).data;
    const red = pixel[0];
    const green = pixel[1];
    const blue = pixel[2];
    const alpha = pixel[3];
    if (
      red === undefined ||
      green === undefined ||
      blue === undefined ||
      alpha === undefined
    ) {
      return null;
    }
    if (alpha === 0) return "transparent";

    return `#${[red, green, blue]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")}`;
  } catch {
    return null;
  }
}

export function Canvas() {
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const interactiveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<Viewport>(INITIAL_VIEWPORT);
  const pointerRef = useRef<Point>({ x: 0, y: 0 });
  const scenePointerRef = useRef<Point>({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const lastPointerRef = useRef<Point>({ x: 0, y: 0 });
  const spacePressRef = useRef(false);
  const visibleElementCountRef = useRef(0);
  const eyedropperPointerIdRef = useRef<number | null>(null);

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
          visibleElementCountRef.current = renderStatic(
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
          renderInteractive(
            {
              context: interactiveContext,
              width,
              height,
              viewport: viewportRef.current,
            },
            (() => {
              const preview = toolManager.getPreviewElement();
              return preview
                ? { ...preview, ...styleStore.getElementStyle() }
                : null;
            })(),
          );

          const selectedElements = [...selectionStore.getSnapshot()]
            .map((id) => scene.getElement(id))
            .filter(
              (element): element is Element =>
                element !== undefined && !element.isDeleted,
            );

          drawSelectionOverlay(
            interactiveContext,
            viewportRef.current,
            selectedElements,
            selectionController.getMarquee(),
            selectionController.getPointEditingElement(),
            selectionController.isCompleteGroupSelection(),
          );
        },
      },
      {
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (handle) => window.cancelAnimationFrame(handle),
      },
    );

    const updateCanvasCursor = () => {
      const activeTool = toolManager.getActiveTool();
      if (eyedropperStore.getTarget()) {
        interactiveCanvas.style.cursor = "none";
      } else if (isPanningRef.current) {
        interactiveCanvas.style.cursor = "grabbing";
      } else if (activeTool === "hand") {
        interactiveCanvas.style.cursor = "grab";
      } else if (activeTool === "selection") {
        interactiveCanvas.style.cursor = selectionController.getCursor(
          scenePointerRef.current,
          viewportRef.current.zoom,
        );
      } else {
        interactiveCanvas.style.cursor = "crosshair";
      }
    };

    const unsubscribeToolManager = toolManager.subscribe(() => {
      updateCanvasCursor();
      renderLoop.invalidateInteractive();
    });

    const unsubscribeSelectionStore = selectionStore.subscribe(() => {
      renderLoop.invalidateInteractive();
    });
    const unsubscribeStyleStore = styleStore.subscribe(() => {
      renderLoop.invalidateInteractive();
    });

    const publishDiagnostics = () => {
      renderDiagnostics.update(
        renderLoop.getStats(),
        scene.size,
        visibleElementCountRef.current,
        viewportRef.current.zoom,
      );
    };

    renderLoop.start();
    publishDiagnostics();

    const diagnosticsInterval = window.setInterval(publishDiagnostics, 500);

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

      if (eyedropperPointerIdRef.current === event.pointerId) return;

      if (eyedropperStore.getTarget()) {
        interactiveCanvas.style.cursor = "none";
        eyedropperStore.updatePointer(
          point,
          sampleCanvasColor(staticCanvas, staticContext, point),
        );
        return;
      }

      if (isPanningRef.current) {
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
        interactiveCanvas.style.cursor = "grabbing";
        renderLoop.invalidateStatic();
        return;
      }

      const scenePoint = viewportToScene(point, viewportRef.current);

      if (toolManager.getActiveTool() === "hand") {
        interactiveCanvas.style.cursor = "grab";
        return;
      }

      if (toolManager.getActiveTool() === "selection") {
        interactiveCanvas.style.cursor = selectionController.getCursor(
          scenePoint,
          viewportRef.current.zoom,
        );
        selectionController.pointerMove(
          scenePoint,
          event.shiftKey,
          event.altKey,
        );
        renderLoop.invalidateInteractive();
        return;
      }

      toolManager.onPointerMove(scenePoint, {
        shiftKey: event.shiftKey,
        button: event.button,
        pointerId: event.pointerId,
        pressure: event.pressure,
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const eyedropperTarget = eyedropperStore.getTarget();
      if (eyedropperTarget) {
        if (event.button !== 0) return;
        event.preventDefault();
        eyedropperPointerIdRef.current = event.pointerId;
        interactiveCanvas.setPointerCapture(event.pointerId);

        const point = getPointerPosition(event);
        const color = sampleCanvasColor(staticCanvas, staticContext, point);
        if (color) {
          const changes =
            eyedropperTarget === "strokeColor"
              ? { strokeColor: color }
              : {
                  backgroundColor: color,
                  ...(styleStore.getSnapshot().fillStyle === "none"
                    ? { fillStyle: "solid" as const }
                    : {}),
                };

          styleStore.update(changes);
          colorHistoryStore.add(color);
          for (const id of selectionStore.getSnapshot()) {
            const element = scene.getElement(id);
            if (element && !element.isDeleted) {
              scene.mutateElement(element.id, changes);
            }
          }
          eyedropperStore.cancel();
          updateCanvasCursor();
        }
        return;
      }

      const isMiddleMouse = event.button === 1;
      const isSpacePan = event.button === 0 && spacePressRef.current;

      if (isMiddleMouse || isSpacePan) {
        event.preventDefault();

        isPanningRef.current = true;
        interactiveCanvas.style.cursor = "grabbing";
        lastPointerRef.current = getPointerPosition(event);
        interactiveCanvas.setPointerCapture(event.pointerId);
        return;
      }

      if (event.button === 0 && toolManager.getActiveTool() === "hand") {
        event.preventDefault();
        isPanningRef.current = true;
        interactiveCanvas.style.cursor = "grabbing";
        lastPointerRef.current = getPointerPosition(event);
        interactiveCanvas.setPointerCapture(event.pointerId);
        return;
      }

      if (event.button !== 0) return;

      const viewportPoint = getPointerPosition(event);
      const scenePoint = viewportToScene(viewportPoint, viewportRef.current);

      if (toolManager.getActiveTool() === "selection") {
        selectionController.pointerDown(
          scenePoint,
          event.shiftKey,
          viewportRef.current.zoom,
          event.altKey,
        );

        interactiveCanvas.style.cursor = selectionController.getCursor(
          scenePoint,
          viewportRef.current.zoom,
        );
        renderLoop.invalidateInteractive();
        interactiveCanvas.setPointerCapture(event.pointerId);
        return;
      }

      toolManager.onPointerDown(scenePoint, {
        shiftKey: event.shiftKey,
        button: event.button,
        pointerId: event.pointerId,
        pressure: event.pressure,
      });

      interactiveCanvas.setPointerCapture(event.pointerId);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (eyedropperPointerIdRef.current === event.pointerId) {
        eyedropperPointerIdRef.current = null;
        if (interactiveCanvas.hasPointerCapture(event.pointerId)) {
          interactiveCanvas.releasePointerCapture(event.pointerId);
        }
        return;
      }

      if (isPanningRef.current) {
        isPanningRef.current = false;
        const pointer = getPointerPosition(event);
        scenePointerRef.current = viewportToScene(pointer, viewportRef.current);
        updateCanvasCursor();

        if (interactiveCanvas.hasPointerCapture(event.pointerId)) {
          interactiveCanvas.releasePointerCapture(event.pointerId);
        }

        return;
      }

      if (event.button !== 0) {
        return;
      }

      const viewportPoint = getPointerPosition(event);
      const scenePoint = viewportToScene(viewportPoint, viewportRef.current);

      if (toolManager.getActiveTool() === "selection") {
        selectionController.pointerUp(scenePoint, event.shiftKey, event.altKey);
        interactiveCanvas.style.cursor = selectionController.getCursor(
          scenePoint,
          viewportRef.current.zoom,
        );
        renderLoop.invalidateInteractive();

        if (interactiveCanvas.hasPointerCapture(event.pointerId)) {
          interactiveCanvas.releasePointerCapture(event.pointerId);
        }

        return;
      }

      toolManager.onPointerUp(scenePoint, {
        shiftKey: event.shiftKey,
        button: event.button,
        pointerId: event.pointerId,
        pressure: event.pressure,
      });

      if (interactiveCanvas.hasPointerCapture(event.pointerId)) {
        interactiveCanvas.releasePointerCapture(event.pointerId);
      }
    };

    const handleDoubleClick = (event: MouseEvent) => {
      if (toolManager.getActiveTool() === "multiPointLine") {
        event.preventDefault();
        toolManager.commit();
        renderLoop.invalidateInteractive();
        return;
      }
      if (toolManager.getActiveTool() !== "selection") return;
      event.preventDefault();
      const point = getPointerPosition(event);
      selectionController.handleDoubleClick(
        viewportToScene(point, viewportRef.current),
        viewportRef.current.zoom,
      );
      renderLoop.invalidateInteractive();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.code === "Space") {
        spacePressRef.current = true;
        event.preventDefault();
        return;
      }

      if (event.key === "Escape") {
        if (eyedropperStore.getTarget()) {
          eyedropperStore.cancel();
          updateCanvasCursor();
          renderLoop.invalidateInteractive();
          return;
        }
        if (selectionController.exitPointEditing()) {
          renderLoop.invalidateInteractive();
          return;
        }
        if (selectionController.exitGroupEditing()) {
          renderLoop.invalidateInteractive();
          return;
        }
        toolManager.cancel();
        selectionStore.clear();
        renderLoop.invalidateInteractive();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectionController.selectAll();
        return;
      }

      if (
        toolManager.getActiveTool() === "selection" &&
        (event.ctrlKey || event.metaKey) &&
        event.code === "KeyG"
      ) {
        event.preventDefault();
        if (event.shiftKey) selectionController.ungroupSelection();
        else selectionController.groupSelection();
        return;
      }

      if (
        toolManager.getActiveTool() === "selection" &&
        (event.ctrlKey || event.metaKey) &&
        event.code === "KeyD"
      ) {
        event.preventDefault();
        selectionController.duplicateSelection();
        return;
      }

      if (
        toolManager.getActiveTool() === "selection" &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        event.preventDefault();
        selectionController.deleteSelection();
        return;
      }

      if (
        toolManager.getActiveTool() === "selection" &&
        event.key.startsWith("Arrow")
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        selectionController.nudgeSelection(
          event.key === "ArrowLeft"
            ? -step
            : event.key === "ArrowRight"
              ? step
              : 0,
          event.key === "ArrowUp"
            ? -step
            : event.key === "ArrowDown"
              ? step
              : 0,
        );
        return;
      }

      if (event.key === "Enter") {
        toolManager.commit();
        renderLoop.invalidateInteractive();
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "h") {
        toolManager.setActiveTool("hand");
        return;
      }

      if (key === "v") {
        toolManager.setActiveTool("selection");
        return;
      }

      if (key === "r") {
        toolManager.setActiveTool("rectangle");
        return;
      }

      if (key === "e") {
        toolManager.setActiveTool("ellipse");
        return;
      }

      if (key === "d") {
        toolManager.setActiveTool("diamond");
        return;
      }

      if (key === "l") {
        toolManager.setActiveTool("line");
        return;
      }

      if (key === "p") {
        toolManager.setActiveTool("multiPointLine");
        return;
      }

      if (key === "a") {
        toolManager.setActiveTool("arrow");
        return;
      }

      if (key === "c") {
        toolManager.setActiveTool("curved-line");
        return;
      }

      if (key === "f") {
        toolManager.setActiveTool("freedraw");
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
    interactiveCanvas.addEventListener("dblclick", handleDoubleClick);
    interactiveCanvas.addEventListener("pointermove", handlePointerMove);
    interactiveCanvas.addEventListener("pointerup", handlePointerUp);
    interactiveCanvas.addEventListener("wheel", handleWheel, {
      passive: false,
    });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    renderLoop.start();

    return () => {
      unsubscribeToolManager();
      unsubscribeSelectionStore();
      unsubscribeStyleStore();
      clearInterval(diagnosticsInterval);
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
      <EyedropperOverlay />
    </div>
  );
}

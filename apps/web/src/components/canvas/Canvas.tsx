"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  Element,
  Point,
  Viewport,
  PreviewWireElement,
} from "@repo/common";
import {
  createRenderState,
  createElementBitmapCache,
  createTextElement,
  getElementsAtPosition,
  RenderLoop,
  renderInteractive,
  renderStatic,
  viewportToScene,
  zoomAtPoint,
} from "@repo/engine";
import { toolManager } from "@/lib/tools/toolManager";
import { getCanvasPresencePublisher } from "@/lib/presence/presencePublisher";
import {
  beginGesturePreview,
  endGesturePreview,
  getRoomSyncBridge,
  pushGesturePreview,
} from "@/lib/sync/syncBridge";
import { subscribeRoomFilesAvailable } from "@/lib/sync/roomFiles";
import { toPreviewElement } from "@/lib/sync/previewGeometry";
import { commitHistoryEntry } from "@/lib/sync/commits";
import { renderDiagnostics } from "@/lib/canvas/renderDiagnostics";
import { selectionController } from "@/lib/selection/selectionController";
import { drawSelectionOverlay } from "@/lib/canvas/selectionOverlay";
import { selectionStore } from "@/lib/selection/selectionStore";
import { styleStore } from "@/lib/styles/styleStore";
import { eyedropperStore } from "@/lib/styles/eyedropperStore";
import { colorHistoryStore } from "@/lib/styles/colorHistoryStore";
import { historyStore } from "@/lib/history/historyStore";
import { createImageElementFromFile } from "@/lib/persistence/imageFiles";
import {
  getCurrentViewport,
  getInitialViewport,
  setCurrentViewport,
  subscribeViewport,
} from "@/lib/persistence/viewportStore";
import {
  applyImportedDocument,
  publishImportStatus,
  readExcalidrawFile,
} from "@/lib/persistence/importDocument";
import { EyedropperOverlay } from "@/components/styles/EyedropperOverlay";
import {
  CanvasContextMenu,
  type CanvasContextMenuAction,
  type CanvasContextMenuState,
} from "./CanvasContextMenu";

import { scene } from "@/lib/scene/scene";

import {
  commitTextElement,
  TextEditorOverlay,
  type TextEditorState,
} from "./text/TextEditorOverlay";
import { sampleCanvasColor } from "@/lib/canvas/sampleCanvasColor";
import {
  drawEraserTrail,
  ERASER_TRAIL_LIFETIME_MS,
  ERASER_TRAIL_MAX_POINTS,
  type EraserTrailPoint,
} from "@/lib/canvas/eraserTrail";

import { runContextMenuAction } from "@/lib/canvas/contextMenuActions";
import { createImageAssetCache } from "@/lib/canvas/imageAssetCache";
import { createCanvasKeyboardHandler } from "@/lib/canvas/keyboard";
import { createCanvasDoubleClickHandler } from "@/lib/canvas/doubleClick";
import type { SavedCanvasScene } from "@/lib/canvas/types";
import { useCanvasPersistence } from "@/hooks/canvas/useCanvasPersistence";

const INITIAL_VIEWPORT: Viewport = {
  scrollX: 0,
  scrollY: 0,
  zoom: 1,
};

export function Canvas({
  savedScene,
  readOnly = false,
}: {
  savedScene?: SavedCanvasScene;
  readOnly?: boolean;
} = {}) {
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(
    null,
  );
  const [textEditorPosition, setTextEditorPosition] =
    useState<TextEditorState | null>(null);
  const viewport = useSyncExternalStore(
    subscribeViewport,
    getCurrentViewport,
    getInitialViewport,
  );
  const contextMenuRef = useRef<CanvasContextMenuState | null>(null);
  const textEditorRef = useRef<TextEditorState | null>(null);
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
  const { persistenceReady, autosaveRef } = useCanvasPersistence(
    savedScene,
    viewportRef,
  );
  const imageAssetsRef = useRef(new Map<string, ImageBitmap>());

  const closeContextMenu = useCallback(() => {
    contextMenuRef.current = null;
    setContextMenu(null);
  }, []);

  useEffect(() => {
    if (!readOnly) return;
    closeContextMenu();
    eyedropperStore.cancel();
    if (scene.isCapturing()) {
      commitHistoryEntry(historyStore.endCapture(), "local");
    }
  }, [closeContextMenu, readOnly]);

  const insertImage = useCallback(async (file: File, point: Point) => {
    try {
      const imageElement = await createImageElementFromFile(file, point);
      const { changes } = historyStore.commitUpdate(() => {
        scene.addElement(imageElement);
        selectionStore.set([imageElement.id]);
      });
      commitHistoryEntry(changes, "local");
      publishImportStatus(`Added ${file.name}`);
    } catch (error) {
      publishImportStatus(
        error instanceof Error ? error.message : "Could not add this image",
      );
    }
  }, []);

  const performContextMenuAction = useCallback(
    (action: CanvasContextMenuAction, scenePoint: Point) => {
      closeContextMenu();
      runContextMenuAction(action, scenePoint);
    },
    [closeContextMenu],
  );

  useEffect(() => {
    if (!persistenceReady) return;
    const staticCanvas = staticCanvasRef.current;
    const interactiveCanvas = interactiveCanvasRef.current;

    if (!staticCanvas || !interactiveCanvas) {
      return;
    }
    const imageAssets = imageAssetsRef.current;
    viewportRef.current = getCurrentViewport();

    const staticContext = staticCanvas.getContext("2d");
    const interactiveContext = interactiveCanvas.getContext("2d");

    if (!staticContext || !interactiveContext) {
      return;
    }

    let width = 0;
    let height = 0;
    let pixelRatio = window.devicePixelRatio || 1;
    const bitmapCache = createElementBitmapCache();
    const eraserMarkedIds = new Set<string>();
    const eraserTrailPoints: EraserTrailPoint[] = [];
    let eraserCursor: Point | null = null;
    let eraserPointerId: number | null = null;
    let lastEraserScenePoint: Point | null = null;
    let eraserTrailFrame = 0;

    const renderState = createRenderState();

    const renderLoop = new RenderLoop(
      renderState,
      {
        renderStatic: () => {
          const elements = scene.getElements();
          visibleElementCountRef.current = renderStatic(
            {
              context: staticContext,
              width,
              height,
              viewport: viewportRef.current,
            },
            eraserMarkedIds.size === 0
              ? elements
              : elements.map((element) =>
                  eraserMarkedIds.has(element.id)
                    ? {
                        ...element,
                        opacity: (element.opacity ?? 100) * 0.22,
                      }
                    : element,
                ),
            // Screen cache is DPR-aware; exports and transient previews render directly.
            { grid: false, origin: false, bitmapCache, pixelRatio },
            imageAssets,
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
            scene.getElements(),
          );
          drawEraserTrail(
            interactiveContext,
            eraserTrailPoints,
            toolManager.getActiveTool() === "eraser" ? eraserCursor : null,
            performance.now(),
            toolManager.getActiveTool() === "eraser",
          );
        },
      },
      {
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (handle) => window.cancelAnimationFrame(handle),
      },
    );

    const animateEraserTrail = () => {
      eraserTrailFrame = 0;
      const now = performance.now();
      while (
        eraserTrailPoints[0] &&
        now - eraserTrailPoints[0].time > ERASER_TRAIL_LIFETIME_MS
      ) {
        eraserTrailPoints.shift();
      }
      renderLoop.invalidateInteractive();
      if (eraserTrailPoints.length > 0) {
        eraserTrailFrame = window.requestAnimationFrame(animateEraserTrail);
      }
    };

    const addEraserTrailPoint = (point: Point) => {
      const now = performance.now();
      while (
        eraserTrailPoints[0] &&
        now - eraserTrailPoints[0].time > ERASER_TRAIL_LIFETIME_MS
      ) {
        eraserTrailPoints.shift();
      }
      const previous = eraserTrailPoints[eraserTrailPoints.length - 1];
      if (
        previous &&
        Math.hypot(point.x - previous.x, point.y - previous.y) < 0.5
      ) {
        previous.time = now;
      } else {
        eraserTrailPoints.push({ ...point, time: now });
      }
      if (eraserTrailPoints.length > ERASER_TRAIL_MAX_POINTS) {
        eraserTrailPoints.splice(
          0,
          eraserTrailPoints.length - ERASER_TRAIL_MAX_POINTS,
        );
      }
      if (eraserTrailFrame === 0) {
        eraserTrailFrame = window.requestAnimationFrame(animateEraserTrail);
      }
      renderLoop.invalidateInteractive();
    };

    const eraseAtPoint = (point: Point, restore: boolean): boolean => {
      let changed = false;
      const hits = getElementsAtPosition(
        scene.getElements().filter((element) => !element.isDeleted),
        point,
        viewportRef.current.zoom,
      );
      for (const element of hits) {
        if (restore) changed = eraserMarkedIds.delete(element.id) || changed;
        else if (!eraserMarkedIds.has(element.id)) {
          eraserMarkedIds.add(element.id);
          changed = true;
        }
      }
      return changed;
    };

    const eraseAlongSegment = (
      start: Point | null,
      end: Point,
      restore: boolean,
    ): boolean => {
      if (!start) return eraseAtPoint(end, restore);
      const distanceInPixels =
        Math.hypot(end.x - start.x, end.y - start.y) * viewportRef.current.zoom;
      const steps = Math.max(1, Math.ceil(distanceInPixels / 6));
      let changed = false;
      for (let index = 1; index <= steps; index += 1) {
        const progress = index / steps;
        changed =
          eraseAtPoint(
            {
              x: start.x + (end.x - start.x) * progress,
              y: start.y + (end.y - start.y) * progress,
            },
            restore,
          ) || changed;
      }
      return changed;
    };

    const imageCache = createImageAssetCache(imageAssets, () =>
      renderLoop.invalidateStatic(),
    );
    const unsubscribeRoomFiles = subscribeRoomFilesAvailable(() => {
      imageCache.sync();
      renderLoop.invalidateStatic();
    });

    const updateCanvasCursor = () => {
      const activeTool = toolManager.getActiveTool();
      if (eyedropperStore.getTarget()) {
        interactiveCanvas.style.cursor = "none";
      } else if (isPanningRef.current) {
        interactiveCanvas.style.cursor = "grabbing";
      } else if (activeTool === "hand") {
        interactiveCanvas.style.cursor = "grab";
      } else if (activeTool === "eraser") {
        interactiveCanvas.style.cursor = "none";
      } else if (activeTool === "text") {
        interactiveCanvas.style.cursor = "text";
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
      if (toolManager.getActiveTool() !== "eraser") {
        eraserCursor = null;
        if (eraserMarkedIds.size > 0) {
          eraserMarkedIds.clear();
          renderLoop.invalidateStatic();
        }
        if (eraserPointerId !== null) {
          const pointerId = eraserPointerId;
          eraserPointerId = null;
          lastEraserScenePoint = null;
          if (interactiveCanvas.hasPointerCapture(pointerId)) {
            interactiveCanvas.releasePointerCapture(pointerId);
          }
        }
      }
      updateCanvasCursor();
      renderLoop.invalidateInteractive();
    });

    const unsubscribeSelectionStore = selectionStore.subscribe(() => {
      renderLoop.invalidateInteractive();
      getRoomSyncBridge()?.select([...selectionStore.getSnapshot()]);
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

      pixelRatio = window.devicePixelRatio || 1;
      staticCanvas.width = Math.round(width * pixelRatio);
      staticCanvas.height = Math.round(height * pixelRatio);
      interactiveCanvas.width = Math.round(width * pixelRatio);
      interactiveCanvas.height = Math.round(height * pixelRatio);
      staticCanvas.style.width = `${width}px`;
      staticCanvas.style.height = `${height}px`;
      interactiveCanvas.style.width = `${width}px`;
      interactiveCanvas.style.height = `${height}px`;
      staticContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      interactiveContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      renderLoop.invalidateAll();
    };

    const publishGesturePreview = () => {
      if (!scene.isCapturing()) return;
      const elements: PreviewWireElement[] = [];
      const seen = new Set<string>();
      for (const id of scene.getCapturedIds()) {
        const element = scene.getElement(id);
        if (!element) continue;
        const preview = toPreviewElement(element);
        if (preview) {
          elements.push(preview);
          seen.add(id);
        }
      }
      const toolPreview = toolManager.getPreviewElement();
      if (
        toolPreview &&
        !seen.has(toolPreview.id) &&
        !scene.getElement(toolPreview.id)
      ) {
        const preview = toPreviewElement(toolPreview as Element);
        if (preview) elements.push(preview);
      }
      if (elements.length > 0) {
        pushGesturePreview(elements.slice(0, 200));
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const point = getPointerPosition(event);

      pointerRef.current = point;
      scenePointerRef.current = viewportToScene(point, viewportRef.current);
      getCanvasPresencePublisher()?.pointer(scenePointerRef.current);
      publishGesturePreview();

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

        setCurrentViewport(viewportRef.current);
        autosaveRef.current?.schedule();

        lastPointerRef.current = point;
        scenePointerRef.current = viewportToScene(point, viewportRef.current);
        interactiveCanvas.style.cursor = "grabbing";
        renderLoop.invalidateStatic();
        return;
      }

      if (readOnly) {
        interactiveCanvas.style.cursor = "default";
        return;
      }

      const scenePoint = viewportToScene(point, viewportRef.current);

      if (toolManager.getActiveTool() === "eraser") {
        eraserCursor = point;
        for (const sample of event.getCoalescedEvents?.() ?? []) {
          addEraserTrailPoint(getPointerPosition(sample));
        }
        addEraserTrailPoint(point);
        if (eraserPointerId === event.pointerId) {
          if (
            eraseAlongSegment(lastEraserScenePoint, scenePoint, event.altKey)
          ) {
            renderLoop.invalidateStatic();
          }
          lastEraserScenePoint = scenePoint;
        }
        interactiveCanvas.style.cursor = "none";
        renderLoop.invalidateInteractive();
        return;
      }

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

      const coalescedPoints =
        toolManager.getActiveTool() === "freedraw"
          ? (event.getCoalescedEvents?.() ?? []).map((sample) => ({
              point: viewportToScene(
                getPointerPosition(sample),
                viewportRef.current,
              ),
              pressure: sample.pressure,
            }))
          : undefined;

      toolManager.onPointerMove(scenePoint, {
        shiftKey: event.shiftKey,
        button: event.button,
        pointerId: event.pointerId,
        pressure: event.pressure,
        coalescedPoints,
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (textEditorRef.current) {
        commitTextElement(textEditorRef.current);
        textEditorRef.current = null;
        setTextEditorPosition(null);
      }

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

          const { changes: eyedropperChanges } = historyStore.commitUpdate(
            () => {
              styleStore.update(changes);
              colorHistoryStore.add(color);
              for (const id of selectionStore.getSnapshot()) {
                const element = scene.getElement(id);
                if (element && !element.isDeleted) {
                  scene.mutateElement(element.id, changes);
                }
              }
            },
          );
          commitHistoryEntry(eyedropperChanges, "local");
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

      if (readOnly) {
        event.preventDefault();
        const point = viewportToScene(
          getPointerPosition(event),
          viewportRef.current,
        );
        selectionController.selectAtContextMenu(
          point,
          viewportRef.current.zoom,
        );
        renderLoop.invalidateInteractive();
        return;
      }

      if (event.button !== 0) return;

      const viewportPoint = getPointerPosition(event);
      const scenePoint = viewportToScene(viewportPoint, viewportRef.current);

      if (toolManager.getActiveTool() === "eraser") {
        event.preventDefault();
        eraserMarkedIds.clear();
        eraserPointerId = event.pointerId;
        lastEraserScenePoint = scenePoint;
        eraserCursor = viewportPoint;
        addEraserTrailPoint(viewportPoint);
        if (eraseAlongSegment(null, scenePoint, event.altKey)) {
          renderLoop.invalidateStatic();
        }
        interactiveCanvas.style.cursor = "none";
        interactiveCanvas.setPointerCapture(event.pointerId);
        renderLoop.invalidateInteractive();
        return;
      }

      if (toolManager.getActiveTool() === "text") {
        event.preventDefault();
        commitTextElement(textEditorRef.current);
        historyStore.startCapture();
        const textElement = createTextElement({
          text: "",
          x: scenePoint.x,
          y: scenePoint.y,
        });
        scene.addElement({
          ...textElement,
          ...styleStore.getElementStyle(),
        });
        const editor: TextEditorState = {
          elementId: textElement.id,
          angle: textElement.angle ?? 0,
          fontSize: textElement.fontSize,
          fontFamily: textElement.fontFamily,
          textAlign: textElement.textAlign,
          verticalAlign: textElement.verticalAlign,
          sceneX: scenePoint.x,
          sceneY: scenePoint.y,
          value: "",
          inputWidth: 20,
          inputHeight: 24,
        };
        textEditorRef.current = editor;
        setTextEditorPosition(editor);
        return;
      }

      if (toolManager.getActiveTool() === "selection") {
        historyStore.startCapture();
        beginGesturePreview();
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

      historyStore.startCapture();
      beginGesturePreview();
      toolManager.onPointerDown(scenePoint, {
        shiftKey: event.shiftKey,
        button: event.button,
        pointerId: event.pointerId,
        pressure: event.pressure,
      });

      interactiveCanvas.setPointerCapture(event.pointerId);
    };

    const handlePointerUp = (event: PointerEvent) => {
      endGesturePreview();
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

      if (readOnly) return;

      if (eraserPointerId === event.pointerId) {
        eraserPointerId = null;
        lastEraserScenePoint = null;
        const erasedIds = [...eraserMarkedIds];
        if (erasedIds.length > 0) {
          const { changes: eraserChanges } = historyStore.commitUpdate(() => {
            for (const id of erasedIds) {
              const element = scene.getElement(id);
              if (element && !element.isDeleted) {
                scene.mutateElement(id, { isDeleted: true });
              }
            }
            selectionStore.set(
              [...selectionStore.getSnapshot()].filter(
                (id) => !eraserMarkedIds.has(id),
              ),
            );
          });
          commitHistoryEntry(eraserChanges, "local");
        }
        eraserMarkedIds.clear();
        renderLoop.invalidateStatic();
        renderLoop.invalidateInteractive();
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
        commitHistoryEntry(historyStore.endCapture(), "local");
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
      commitHistoryEntry(historyStore.endCapture(), "local");

      if (interactiveCanvas.hasPointerCapture(event.pointerId)) {
        interactiveCanvas.releasePointerCapture(event.pointerId);
      }
    };

    const handlePointerCancel = (event: PointerEvent) => {
      endGesturePreview();
      if (eraserPointerId !== event.pointerId) return;
      eraserPointerId = null;
      lastEraserScenePoint = null;
      eraserMarkedIds.clear();
      renderLoop.invalidateStatic();
      renderLoop.invalidateInteractive();
      updateCanvasCursor();
    };

    const handlePointerLeave = () => {
      getCanvasPresencePublisher()?.leave();
      endGesturePreview();
      if (eraserPointerId !== null) return;
      eraserCursor = null;
      renderLoop.invalidateInteractive();
    };

    const handleDoubleClick = createCanvasDoubleClickHandler({
      getPointerPosition,
      viewportRef,
      textEditorRef,
      setTextEditorPosition,
      renderLoop,
    });
    const guardedDoubleClick = (event: MouseEvent) => {
      if (!readOnly) handleDoubleClick(event);
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (readOnly) {
        event.preventDefault();
        return;
      }
      if (eyedropperStore.getTarget()) return;
      event.preventDefault();

      const viewportPoint = getPointerPosition(event);
      const scenePoint = viewportToScene(viewportPoint, viewportRef.current);
      pointerRef.current = viewportPoint;
      scenePointerRef.current = scenePoint;
      if (toolManager.getActiveTool() === "selection") {
        selectionController.selectAtContextMenu(
          scenePoint,
          viewportRef.current.zoom,
        );
      }
      const selectedElements = [...selectionStore.getSnapshot()]
        .map((id) => scene.getElement(id))
        .filter(
          (element): element is Element =>
            element !== undefined && !element.isDeleted,
        );
      const width = 224;
      const height = 440;
      const next: CanvasContextMenuState = {
        x: Math.min(
          Math.max(8, event.clientX),
          Math.max(8, window.innerWidth - width - 8),
        ),
        y: Math.min(
          Math.max(8, event.clientY),
          Math.max(8, window.innerHeight - height - 8),
        ),
        scenePoint,
        selectedCount: selectedElements.length,
        hasGroupedSelection: selectedElements.some(
          (element) => (element.groupIds?.length ?? 0) > 0,
        ),
      };
      contextMenuRef.current = next;
      setContextMenu(next);
    };

    const editorKeyDown = createCanvasKeyboardHandler({
      renderLoop,
      spacePressRef,
      contextMenuRef,
      viewportRef,
      pointerRef,
      scenePointerRef,
      autosaveRef,
      closeContextMenu,
      updateCanvasCursor,
      insertImage,
      getCanvasSize: () => ({ width, height }),
      cancelEraser: () => {
        if (eraserPointerId === null) return false;

        const pointerId = eraserPointerId;
        eraserPointerId = null;
        lastEraserScenePoint = null;
        eraserMarkedIds.clear();
        if (interactiveCanvas.hasPointerCapture(pointerId)) {
          interactiveCanvas.releasePointerCapture(pointerId);
        }
        updateCanvasCursor();
        renderLoop.invalidateStatic();
        renderLoop.invalidateInteractive();
        return true;
      },
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!readOnly) {
        editorKeyDown(event);
        return;
      }
      const target = event.target;
      const isTextEntry =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.matches('input, textarea, select, [role="textbox"]'));
      if (event.code === "Space" && !isTextEntry) {
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
      pointerRef.current = cursor;
      const viewport = viewportRef.current;
      if (event.ctrlKey) {
        const zoomFactor = Math.exp(-event.deltaY * 0.001);
        const nextZoom = viewport.zoom * zoomFactor;
        viewportRef.current = zoomAtPoint(viewport, cursor, nextZoom);
      } else {
        const deltaScale =
          event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? 16
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
              ? interactiveCanvas.clientHeight
              : 1;
        viewportRef.current = {
          ...viewport,
          scrollX: viewport.scrollX - event.deltaX * deltaScale,
          scrollY: viewport.scrollY - event.deltaY * deltaScale,
        };
      }

      setCurrentViewport(viewportRef.current);
      autosaveRef.current?.schedule();
      scenePointerRef.current = viewportToScene(cursor, viewportRef.current);
      renderLoop.invalidateStatic();
    };

    const unsubscribe = scene.subscribe(() => {
      renderLoop.invalidateStatic();
      imageCache.sync();
    });
    const unsubscribeViewport = subscribeViewport(() => {
      viewportRef.current = getCurrentViewport();
      autosaveRef.current?.schedule();
      renderLoop.invalidateStatic();
      renderLoop.invalidateInteractive();
    });

    resizeCanvas();
    imageCache.sync();

    window.addEventListener("resize", resizeCanvas);
    interactiveCanvas.addEventListener("pointerdown", handlePointerDown);
    interactiveCanvas.addEventListener("contextmenu", handleContextMenu);
    interactiveCanvas.addEventListener("dblclick", guardedDoubleClick);
    interactiveCanvas.addEventListener("pointermove", handlePointerMove);
    interactiveCanvas.addEventListener("pointerup", handlePointerUp);
    interactiveCanvas.addEventListener("pointercancel", handlePointerCancel);
    interactiveCanvas.addEventListener("pointerleave", handlePointerLeave);
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
      unsubscribeViewport();
      unsubscribeRoomFiles();
      clearInterval(diagnosticsInterval);
      unsubscribe();
      renderLoop.stop();
      imageCache.dispose();
      bitmapCache.clear();
      window.removeEventListener("resize", resizeCanvas);
      interactiveCanvas.removeEventListener("pointerdown", handlePointerDown);
      interactiveCanvas.removeEventListener("contextmenu", handleContextMenu);
      interactiveCanvas.removeEventListener("dblclick", guardedDoubleClick);
      interactiveCanvas.removeEventListener("pointermove", handlePointerMove);
      interactiveCanvas.removeEventListener("pointerup", handlePointerUp);
      interactiveCanvas.removeEventListener(
        "pointercancel",
        handlePointerCancel,
      );
      interactiveCanvas.removeEventListener("pointerleave", handlePointerLeave);
      if (eraserTrailFrame !== 0) {
        window.cancelAnimationFrame(eraserTrailFrame);
      }
      interactiveCanvas.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [autosaveRef, closeContextMenu, insertImage, persistenceReady, readOnly]);

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ visibility: persistenceReady ? "visible" : "hidden" }}
      aria-busy={!persistenceReady}
      onDragOver={(event) => {
        if (!readOnly && event.dataTransfer.types.includes("Files"))
          event.preventDefault();
      }}
      onDrop={(event) => {
        if (readOnly) return;
        const file = event.dataTransfer.files[0];
        if (!file) return;
        event.preventDefault();
        if (file.name.toLowerCase().endsWith(".excalidraw")) {
          void readExcalidrawFile(file)
            .then(async (document) => {
              await applyImportedDocument(document);
              publishImportStatus(`Imported ${file.name}`);
            })
            .catch((error: unknown) => {
              publishImportStatus(
                error instanceof Error
                  ? error.message
                  : "Could not import this drawing",
              );
            });
          return;
        }
        if (file.type.startsWith("image/")) {
          const rect = event.currentTarget.getBoundingClientRect();
          const point = viewportToScene(
            { x: event.clientX - rect.left, y: event.clientY - rect.top },
            viewportRef.current,
          );
          void insertImage(file, point);
        }
      }}
    >
      <canvas
        ref={staticCanvasRef}
        className="absolute inset-0 block h-full w-full"
      />

      <canvas
        ref={interactiveCanvasRef}
        className="absolute inset-0 block h-full w-full touch-none select-none"
      />
      {textEditorPosition && (
        <TextEditorOverlay
          key={textEditorPosition.elementId}
          initialEditor={textEditorPosition}
          viewport={viewport}
          onUpdate={(editor) => {
            textEditorRef.current = editor;
          }}
          onClose={() => {
            textEditorRef.current = null;
            setTextEditorPosition(null);
          }}
        />
      )}
      <EyedropperOverlay />
      {contextMenu && (
        <CanvasContextMenu
          state={contextMenu}
          onAction={performContextMenuAction}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}

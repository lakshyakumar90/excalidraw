"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Element, Point, Viewport } from "@repo/common";
import {
  createRenderState,
  createTextElement,
  getArrowMidpoint,
  getElementAtPosition,
  RenderLoop,
  renderInteractive,
  renderStatic,
  sceneToViewport,
  viewportToScene,
  zoomAtPoint,
  measureText,
} from "@repo/engine";
import { toolManager } from "@/lib/tools/toolManager";
import { renderDiagnostics } from "@/lib/canvas/renderDiagnostics";
import { selectionController } from "@/lib/selection/selectionController";
import { drawSelectionOverlay } from "@/lib/canvas/selectionOverlay";
import { selectionStore } from "@/lib/selection/selectionStore";
import { styleStore } from "@/lib/styles/styleStore";
import { eyedropperStore } from "@/lib/styles/eyedropperStore";
import { colorHistoryStore } from "@/lib/styles/colorHistoryStore";
import { historyStore } from "@/lib/history/historyStore";
import { startAutosave, type AutosaveHandle } from "@/lib/persistence/autosave";
import { loadScene } from "@/lib/persistence/indexedDb";
import {
  createImageElementFromFile,
  loadImageAsset,
} from "@/lib/persistence/imageFiles";
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

const INITIAL_VIEWPORT: Viewport = {
  scrollX: 0,
  scrollY: 0,
  zoom: 1,
};

interface TextEditorState {
  elementId: string;
  containerId?: string;
  wrapText?: boolean;
  angle: number;
  fontSize: number;
  fontFamily: string;
  textAlign: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  sceneX: number;
  sceneY: number;
  value: string;
  inputWidth: number;
  inputHeight: number;
}

function commitTextElement(editor: TextEditorState | null): void {
  if (editor && editor.value.length === 0) {
    scene.removeElement(editor.elementId);
  }
  historyStore.endCapture();
}

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
  const [persistenceReady, setPersistenceReady] = useState(false);
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
  const autosaveRef = useRef<AutosaveHandle | null>(null);
  const imageAssetsRef = useRef(new Map<string, ImageBitmap>());

  const closeContextMenu = useCallback(() => {
    contextMenuRef.current = null;
    setContextMenu(null);
  }, []);

  const insertImage = useCallback(async (file: File, point: Point) => {
    try {
      const imageElement = await createImageElementFromFile(file, point);
      historyStore.captureUpdate(() => {
        scene.addElement(imageElement);
        selectionStore.set([imageElement.id]);
      });
      publishImportStatus(`Added ${file.name}`);
    } catch (error) {
      publishImportStatus(
        error instanceof Error ? error.message : "Could not add this image",
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let autosave: AutosaveHandle | null = null;

    void loadScene()
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          scene.replaceAll(saved.elements);
          scene.markClean();
          const restoredViewport = saved.viewport;
          if (
            Number.isFinite(restoredViewport.scrollX) &&
            Number.isFinite(restoredViewport.scrollY) &&
            Number.isFinite(restoredViewport.zoom) &&
            restoredViewport.zoom > 0
          ) {
            viewportRef.current = restoredViewport;
            setCurrentViewport(restoredViewport);
          }
        }
        autosave = startAutosave(scene, () => viewportRef.current);
        autosaveRef.current = autosave;
        setPersistenceReady(true);
      })
      .catch((error: unknown) => {
        console.error("Could not restore the local drawing", error);
        if (!cancelled) {
          autosave = startAutosave(scene, () => viewportRef.current);
          autosaveRef.current = autosave;
          setPersistenceReady(true);
        }
      });

    return () => {
      cancelled = true;
      autosave?.stop();
      autosaveRef.current = null;
    };
  }, []);

  const performContextMenuAction = useCallback(
    (action: CanvasContextMenuAction, scenePoint: Point) => {
      closeContextMenu();
      switch (action) {
        case "paste":
          void selectionController.pasteFromClipboard(scenePoint);
          break;
        case "select-all":
          selectionController.selectAll();
          break;
        case "cut":
          void selectionController.copySelectionToClipboard().then((copied) => {
            if (copied) selectionController.deleteSelection();
          });
          break;
        case "copy":
          void selectionController.copySelectionToClipboard();
          break;
        case "duplicate":
          selectionController.duplicateSelection();
          break;
        case "group":
          selectionController.groupSelection();
          break;
        case "ungroup":
          selectionController.ungroupSelection();
          break;
        case "backward":
        case "forward":
        case "back":
        case "front":
          scene.reorderElements(selectionStore.getSnapshot(), action);
          break;
        case "delete":
          selectionController.deleteSelection();
          break;
      }
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
            {},
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
          );
        },
      },
      {
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (handle) => window.cancelAnimationFrame(handle),
      },
    );

    let disposed = false;
    const loadingImageIds = new Set<string>();
    const syncImageAssets = () => {
      const imageIds = new Set(
        scene
          .getElements()
          .flatMap((element) =>
            element.type === "image" && !element.isDeleted
              ? [element.fileId]
              : [],
          ),
      );
      for (const [id, bitmap] of imageAssets) {
        if (!imageIds.has(id)) {
          bitmap.close();
          imageAssets.delete(id);
        }
      }
      for (const id of imageIds) {
        if (imageAssets.has(id) || loadingImageIds.has(id)) continue;
        loadingImageIds.add(id);
        void loadImageAsset(id)
          .then((bitmap) => {
            loadingImageIds.delete(id);
            const stillNeeded = scene.getElements().some(
              (element) =>
                element.type === "image" &&
                element.fileId === id &&
                !element.isDeleted,
            );
            if (!bitmap) {
              console.error(`Could not find stored image ${id}`);
              return;
            }
            if (disposed || !stillNeeded) {
              bitmap.close();
              return;
            }
            imageAssets.set(id, bitmap);
            renderLoop.invalidateStatic();
          })
          .catch((error: unknown) => {
            loadingImageIds.delete(id);
            console.error("Could not load an image from local storage", error);
          });
      }
    };

    const updateCanvasCursor = () => {
      const activeTool = toolManager.getActiveTool();
      if (eyedropperStore.getTarget()) {
        interactiveCanvas.style.cursor = "none";
      } else if (isPanningRef.current) {
        interactiveCanvas.style.cursor = "grabbing";
      } else if (activeTool === "hand") {
        interactiveCanvas.style.cursor = "grab";
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

        setCurrentViewport(viewportRef.current);
        autosaveRef.current?.schedule();

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

          historyStore.captureUpdate(() => {
            styleStore.update(changes);
            colorHistoryStore.add(color);
            for (const id of selectionStore.getSnapshot()) {
              const element = scene.getElement(id);
              if (element && !element.isDeleted) {
                scene.mutateElement(element.id, changes);
              }
            }
          });
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
        historyStore.endCapture();
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
      historyStore.endCapture();

      if (interactiveCanvas.hasPointerCapture(event.pointerId)) {
        interactiveCanvas.releasePointerCapture(event.pointerId);
      }
    };

    const handleDoubleClick = (event: MouseEvent) => {
      if (toolManager.getActiveTool() === "multiPointLine") {
        event.preventDefault();
        historyStore.captureUpdate(() => toolManager.commit());
        renderLoop.invalidateInteractive();
        return;
      }
      if (toolManager.getActiveTool() !== "selection") return;
      event.preventDefault();
      const point = getPointerPosition(event);
      const scenePoint = viewportToScene(point, viewportRef.current);
      const hitElement = getElementAtPosition(
        scene.getElements(),
        scenePoint,
        viewportRef.current.zoom,
      );
      const container =
        hitElement?.type === "rectangle" || hitElement?.type === "arrow"
          ? hitElement
          : hitElement?.type === "text" && hitElement.containerId
            ? scene.getElement(hitElement.containerId)
            : undefined;

      if (container?.type === "rectangle" || container?.type === "arrow") {
        commitTextElement(textEditorRef.current);
        let createdText = false;
        let textElement = scene
          .getElements()
          .find(
            (element): element is Extract<Element, { type: "text" }> =>
              element.type === "text" &&
              element.containerId === container.id &&
              !element.isDeleted,
          );

        if (!textElement) {
          createdText = true;
          historyStore.startCapture();
          if (container.type === "rectangle") {
            textElement = createTextElement({
              text: "",
              x: container.x,
              y: container.y,
              width: container.width,
              height: container.height,
              angle: container.angle,
              textAlign: "center",
              verticalAlign: "middle",
              containerId: container.id,
            });
          } else {
            const midpoint = getArrowMidpoint(container);
            const emptyTextMetrics = measureText("");
            textElement = createTextElement({
              text: "",
              x: midpoint.x - 10,
              y: midpoint.y - emptyTextMetrics.height / 2,
              width: 20,
              height: emptyTextMetrics.height,
              textAlign: "center",
              verticalAlign: "middle",
              containerId: container.id,
            });
          }
          scene.addElement({
            ...textElement,
            ...styleStore.getElementStyle(),
          });
          scene.mutateElement(container.id, {
            boundElements: [
              ...new Set([...(container.boundElements ?? []), textElement.id]),
            ],
          });
        }

        if (!createdText) {
          historyStore.startCapture();
        }
        const editor: TextEditorState = {
          elementId: textElement.id,
          containerId: container.id,
          wrapText: textElement.wrapText,
          angle: textElement.angle ?? 0,
          fontSize: textElement.fontSize,
          fontFamily: textElement.fontFamily,
          textAlign: textElement.textAlign,
          verticalAlign: textElement.verticalAlign,
          sceneX: textElement.x,
          sceneY: textElement.y,
          value: textElement.text,
          inputWidth:
            textElement.width ??
            (container.type === "rectangle" ? container.width : undefined) ??
            20,
          inputHeight:
            textElement.height ??
            (container.type === "rectangle" ? container.height : undefined) ??
            24,
        };
        textEditorRef.current = editor;
        setTextEditorPosition(editor);
        return;
      }

      if (hitElement?.type === "text") {
        commitTextElement(textEditorRef.current);
        historyStore.startCapture();
        const editor: TextEditorState = {
          elementId: hitElement.id,
          wrapText: hitElement.wrapText,
          angle: hitElement.angle ?? 0,
          fontSize: hitElement.fontSize,
          fontFamily: hitElement.fontFamily,
          textAlign: hitElement.textAlign,
          verticalAlign: hitElement.verticalAlign,
          sceneX: hitElement.x,
          sceneY: hitElement.y,
          value: hitElement.text,
          inputWidth: hitElement.width ?? measureText(
            hitElement.text,
            hitElement.fontSize,
            hitElement.fontFamily,
          ).width,
          inputHeight: hitElement.height ?? 24,
        };
        textEditorRef.current = editor;
        setTextEditorPosition(editor);
        return;
      }

      if (hitElement && (hitElement.groupIds?.length ?? 0) > 0) {
        selectionController.handleDoubleClick(
          scenePoint,
          viewportRef.current.zoom,
        );
        renderLoop.invalidateInteractive();
        return;
      }

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
    };

    const handleContextMenu = (event: MouseEvent) => {
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

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable)
      ) {
        const isZoomShortcut =
          (event.ctrlKey || event.metaKey) &&
          ["+", "=", "-", "0"].includes(event.key);
        if (!isZoomShortcut) return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) historyStore.redo();
        else historyStore.undo();
        renderLoop.invalidateStatic();
        renderLoop.invalidateInteractive();
        return;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        historyStore.redo();
        renderLoop.invalidateStatic();
        renderLoop.invalidateInteractive();
        return;
      }

      if (event.code === "Space") {
        spacePressRef.current = true;
        event.preventDefault();
        return;
      }

      if (event.key === "Escape") {
        if (contextMenuRef.current) {
          event.preventDefault();
          closeContextMenu();
          return;
        }
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
        historyStore.endCapture();
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
        (event.ctrlKey || event.metaKey) &&
        event.code === "KeyC"
      ) {
        event.preventDefault();
        void selectionController.copySelectionToClipboard();
        return;
      }

      if (
        toolManager.getActiveTool() === "selection" &&
        (event.ctrlKey || event.metaKey) &&
        event.code === "KeyX"
      ) {
        event.preventDefault();
        void selectionController.copySelectionToClipboard().then((copied) => {
          if (copied) selectionController.deleteSelection();
        });
        return;
      }

      if (
        toolManager.getActiveTool() === "selection" &&
        (event.ctrlKey || event.metaKey) &&
        event.code === "KeyV"
      ) {
        event.preventDefault();
        void (async () => {
          let imageWasPasted = false;
          try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
              const mimeType = item.types.find((type) =>
                type.startsWith("image/"),
              );
              if (!mimeType) continue;
              const blob = await item.getType(mimeType);
              const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
              const file = new File([blob], `pasted-image.${extension}`, {
                type: mimeType,
              });
              await insertImage(file, scenePointerRef.current);
              imageWasPasted = true;
              break;
            }
          } catch {
            // Fall back to the app's JSON clipboard format when image access is unavailable.
          }
          if (!imageWasPasted) {
            await selectionController.pasteFromClipboard(scenePointerRef.current);
          }
          renderLoop.invalidateInteractive();
        })();
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
        historyStore.captureUpdate(() => toolManager.commit());
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

      if (key === "t") {
        toolManager.setActiveTool("text");
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

        setCurrentViewport(viewportRef.current);
        autosaveRef.current?.schedule();

        renderLoop.invalidateStatic();
      }

      if (event.key === "-") {
        event.preventDefault();

        viewportRef.current = zoomAtPoint(
          viewport,
          center,
          viewport.zoom / 1.2,
        );

        setCurrentViewport(viewportRef.current);
        autosaveRef.current?.schedule();

        renderLoop.invalidateStatic();
      }

      if (event.key === "0") {
        event.preventDefault();

        viewportRef.current = zoomAtPoint(viewport, center, 1);

        setCurrentViewport(viewportRef.current);
        autosaveRef.current?.schedule();

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

      setCurrentViewport(viewportRef.current);
      autosaveRef.current?.schedule();
      scenePointerRef.current = viewportToScene(cursor, viewportRef.current);
      renderLoop.invalidateStatic();
    };

    const unsubscribe = scene.subscribe(() => {
      renderLoop.invalidateStatic();
      syncImageAssets();
    });
    const unsubscribeViewport = subscribeViewport(() => {
      viewportRef.current = getCurrentViewport();
      renderLoop.invalidateStatic();
      renderLoop.invalidateInteractive();
    });

    resizeCanvas();
    syncImageAssets();

    window.addEventListener("resize", resizeCanvas);
    interactiveCanvas.addEventListener("pointerdown", handlePointerDown);
    interactiveCanvas.addEventListener("contextmenu", handleContextMenu);
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
      unsubscribeViewport();
      clearInterval(diagnosticsInterval);
      unsubscribe();
      renderLoop.stop();
      disposed = true;
      for (const bitmap of imageAssets.values()) bitmap.close();
      imageAssets.clear();
      window.removeEventListener("resize", resizeCanvas);
      interactiveCanvas.removeEventListener("pointerdown", handlePointerDown);
      interactiveCanvas.removeEventListener("contextmenu", handleContextMenu);
      interactiveCanvas.removeEventListener("dblclick", handleDoubleClick);
      interactiveCanvas.removeEventListener("pointermove", handlePointerMove);
      interactiveCanvas.removeEventListener("pointerup", handlePointerUp);
      interactiveCanvas.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [closeContextMenu, insertImage, persistenceReady]);

  const textEditorScreenPosition = textEditorPosition
    ? sceneToViewport(
        { x: textEditorPosition.sceneX, y: textEditorPosition.sceneY },
        viewport,
      )
    : null;

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ visibility: persistenceReady ? "visible" : "hidden" }}
      aria-busy={!persistenceReady}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
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
        <textarea
          aria-label="Text input"
          autoFocus
          value={textEditorPosition.value}
          onChange={(event) => {
            const value = event.currentTarget.value;
            const container = textEditorPosition.containerId
              ? scene.getElement(textEditorPosition.containerId)
              : undefined;
            const maxWidth =
              container?.type === "rectangle"
                ? (container.width ?? 0)
                : textEditorPosition.wrapText
                  ? textEditorPosition.inputWidth
                  : undefined;
            const measured = measureText(
              value,
              textEditorPosition.fontSize,
              textEditorPosition.fontFamily,
              maxWidth,
            );
            const inputWidth = Math.max(20, maxWidth ?? measured.width);
            const arrowMidpoint =
              container?.type === "arrow" ? getArrowMidpoint(container) : null;
            const sceneX = arrowMidpoint
              ? arrowMidpoint.x - inputWidth / 2
              : textEditorPosition.sceneX;
            const sceneY = arrowMidpoint
              ? arrowMidpoint.y - measured.height / 2
              : textEditorPosition.sceneY;
            const zoom = viewportRef.current.zoom;
            event.currentTarget.style.width = `${inputWidth * zoom}px`;
            event.currentTarget.style.height = "auto";
            const inputHeight = Math.max(
              event.currentTarget.scrollHeight / zoom,
              measured.height,
            );
            const containerHeight =
              container?.type === "rectangle"
                ? Math.max(container.height ?? 0, measured.height)
                : textEditorPosition.wrapText
                  ? Math.max(
                      scene.getElement(textEditorPosition.elementId)?.height ?? 0,
                      measured.height,
                    )
                  : measured.height;
            if (
              container?.type === "rectangle" &&
              containerHeight > (container.height ?? 0)
            ) {
              scene.mutateElement(container.id, { height: containerHeight });
            }
            scene.mutateElement(textEditorPosition.elementId, {
              text: value,
              width: maxWidth ?? inputWidth,
              x: sceneX,
              y: sceneY,
              height: containerHeight,
            });
            const editor = {
              ...textEditorPosition,
              sceneX,
              sceneY,
              value,
              inputWidth,
              inputHeight:
                container?.type === "rectangle" ||
                textEditorPosition.wrapText
                  ? Math.max(containerHeight, inputHeight)
                  : inputHeight,
            };
            textEditorRef.current = editor;
            setTextEditorPosition(editor);
          }}
          onKeyDown={(event) => {
            const isEscape = event.key === "Escape";
            const isCommitShortcut =
              event.key === "Enter" && (event.ctrlKey || event.metaKey);
            if (!isEscape && !isCommitShortcut) return;

            event.preventDefault();
            event.stopPropagation();
            commitTextElement(textEditorRef.current);
            textEditorRef.current = null;
            setTextEditorPosition(null);
          }}
          onBlur={() => {
            commitTextElement(textEditorPosition);
            if (
              textEditorRef.current?.elementId === textEditorPosition.elementId
            ) {
              textEditorRef.current = null;
              setTextEditorPosition(null);
            }
          }}
          spellCheck={false}
          className="absolute z-20 resize-none cursor-text overflow-hidden border-0 bg-transparent p-0 text-transparent outline-none"
          style={{
            left: textEditorScreenPosition?.x ?? 0,
            top: textEditorScreenPosition?.y ?? 0,
            width: textEditorPosition.inputWidth * viewport.zoom,
            height: textEditorPosition.inputHeight * viewport.zoom,
            fontSize: textEditorPosition.fontSize * viewport.zoom,
            lineHeight: `${textEditorPosition.fontSize * 1.2 * viewport.zoom}px`,
            textAlign: textEditorPosition.textAlign,
            caretColor: "#1e1e1e",
            transform: `rotate(${textEditorPosition.angle}rad)`,
            transformOrigin: "center center",
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

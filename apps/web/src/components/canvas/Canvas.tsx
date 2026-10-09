"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Point, Viewport } from "@repo/common";
import { viewportToScene } from "@repo/engine";

import { commitHistoryEntry } from "@/lib/sync/commits";

import { selectionStore } from "@/lib/selection/selectionStore";

import { eyedropperStore } from "@/lib/styles/eyedropperStore";

import { historyStore } from "@/lib/history/historyStore";
import { createImageElementFromFile } from "@/lib/persistence/imageFiles";
import {
  getCurrentViewport,
  getInitialViewport,
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
  TextEditorOverlay,
  type TextEditorState,
} from "./text/TextEditorOverlay";

import { runContextMenuAction } from "@/lib/canvas/contextMenuActions";

import type { SavedCanvasScene } from "@/lib/canvas/types";
import { useCanvasPersistence } from "@/hooks/canvas/useCanvasPersistence";

import { useCanvasInteraction } from "@/hooks/canvas/useCanvasInteraction";

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
    // Permission changes synchronize an imperative canvas session and its transient menu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  useCanvasInteraction({
    staticCanvasRef,
    interactiveCanvasRef,
    viewportRef,
    pointerRef,
    scenePointerRef,
    isPanningRef,
    lastPointerRef,
    spacePressRef,
    visibleElementCountRef,
    eyedropperPointerIdRef,
    imageAssetsRef,
    textEditorRef,
    contextMenuRef,
    setContextMenu,
    setTextEditorPosition,
    autosaveRef,
    closeContextMenu,
    insertImage,
    persistenceReady,
    readOnly,
  });

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ visibility: persistenceReady ? "visible" : "hidden" }}
      aria-busy={!persistenceReady}
      aria-label="Drawing canvas. Choose a tool to draw. Use the Elements panel to navigate the drawing with a keyboard."
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

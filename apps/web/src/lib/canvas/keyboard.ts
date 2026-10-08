import type { RefObject } from "react";
import type { Point, Viewport } from "@repo/common";
import { RenderLoop, viewportToScene, zoomAtPoint } from "@repo/engine";
import { getToolForShortcut } from "@/lib/tools/toolDefinitions";
import { toolManager } from "@/lib/tools/toolManager";
import { selectionController } from "@/lib/selection/selectionController";
import { selectionStore } from "@/lib/selection/selectionStore";
import { eyedropperStore } from "@/lib/styles/eyedropperStore";
import { historyStore } from "@/lib/history/historyStore";
import type { AutosaveHandle } from "@/lib/persistence/autosave";
import { setCurrentViewport } from "@/lib/persistence/viewportStore";
import type { CanvasContextMenuState } from "@/components/canvas/CanvasContextMenu";

interface CanvasKeyboardOptions {
  renderLoop: RenderLoop;
  spacePressRef: RefObject<boolean>;
  contextMenuRef: RefObject<CanvasContextMenuState | null>;
  viewportRef: RefObject<Viewport>;
  pointerRef: RefObject<Point>;
  scenePointerRef: RefObject<Point>;
  autosaveRef: RefObject<AutosaveHandle | null>;
  closeContextMenu: () => void;
  updateCanvasCursor: () => void;
  cancelEraser: () => boolean;
  insertImage: (file: File, point: Point) => Promise<void>;
  getCanvasSize: () => { width: number; height: number };
}

export function createCanvasKeyboardHandler({
  renderLoop,
  spacePressRef,
  contextMenuRef,
  viewportRef,
  pointerRef,
  scenePointerRef,
  autosaveRef,
  closeContextMenu,
  updateCanvasCursor,
  cancelEraser,
  insertImage,
  getCanvasSize,
}: CanvasKeyboardOptions) {
  return (event: KeyboardEvent) => {
    const { width, height } = getCanvasSize();
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

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
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
      if (cancelEraser()) return;
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
            const extension =
              mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
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
      selectionStore.getSnapshot().size > 0 &&
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
        event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
      );
      return;
    }

    if (event.key === "Enter") {
      historyStore.captureUpdate(() => toolManager.commit());
      renderLoop.invalidateInteractive();
      return;
    }

    const key = event.key.toLowerCase();

    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      const tool = getToolForShortcut(key);
      if (tool) {
        toolManager.setActiveTool(tool);
        return;
      }
    }

    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    const center: Point = {
      x: width / 2,
      y: height / 2,
    };

    const viewport = viewportRef.current;

    const zoom =
      event.key === "+" || event.key === "="
        ? viewport.zoom * 1.2
        : event.key === "-"
          ? viewport.zoom / 1.2
          : event.key === "0"
            ? 1
            : undefined;
    if (zoom === undefined) return;
    event.preventDefault();
    viewportRef.current = zoomAtPoint(viewport, center, zoom);
    setCurrentViewport(viewportRef.current);
    autosaveRef.current?.schedule();
    renderLoop.invalidateStatic();

    scenePointerRef.current = viewportToScene(
      pointerRef.current,
      viewportRef.current,
    );
  };
}

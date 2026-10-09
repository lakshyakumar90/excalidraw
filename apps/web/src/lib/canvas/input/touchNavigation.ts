import type { Point, Viewport } from "@repo/common";
import { touchViewport } from "@repo/engine";
import { historyStore } from "@/lib/history/historyStore";
import { toolManager } from "@/lib/tools/toolManager";
import { selectionController } from "@/lib/selection/selectionController";
import { endGesturePreview } from "@/lib/sync/syncBridge";
import { setCurrentViewport } from "@/lib/persistence/viewportStore";
export interface TouchNavigationState {
  contacts: Map<number, Point>;
  penActive: boolean;
  navigating: boolean;
  touchStart: Point[];
  touchBase: Viewport;
}
export function createTouchNavigation({
  state,
  resetGesture,
  getPointerPosition,
  isPanningRef,
  viewportRef,
  interactiveCanvas,
  renderLoop,
}: {
  state: TouchNavigationState;
  resetGesture: () => void;
  getPointerPosition: (event: PointerEvent) => Point;
  isPanningRef: React.RefObject<boolean>;
  viewportRef: React.RefObject<Viewport>;
  interactiveCanvas: HTMLCanvasElement;
  renderLoop: { invalidateAll(): void };
}) {
  const touchDown = (event: PointerEvent) => {
    if (event.pointerType === "pen") {
      if (state.contacts.size) resetGesture();
      state.penActive = true;
    }
    if (event.pointerType !== "touch") return;
    if (state.penActive) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    state.contacts.set(event.pointerId, getPointerPosition(event));
    if (state.contacts.size >= 2) {
      event.preventDefault();
      event.stopImmediatePropagation();
      historyStore.cancelCapture();
      toolManager.cancel();
      selectionController.cancelGesture();
      endGesturePreview();
      isPanningRef.current = false;
      state.navigating = true;
      state.touchStart = [...state.contacts.values()].slice(0, 2);
      state.touchBase = { ...viewportRef.current };
      interactiveCanvas.setPointerCapture(event.pointerId);
      renderLoop.invalidateAll();
    }
  };
  const touchMove = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return;
    if (state.penActive) {
      event.stopImmediatePropagation();
      return;
    }
    if (state.contacts.has(event.pointerId))
      state.contacts.set(event.pointerId, getPointerPosition(event));
    if (!state.navigating) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (state.contacts.size >= 2) {
      viewportRef.current = touchViewport(
        state.touchStart,
        [...state.contacts.values()].slice(0, 2),
        state.touchBase,
      );
      setCurrentViewport(viewportRef.current);
      renderLoop.invalidateAll();
    }
  };
  const touchEnd = (event: PointerEvent) => {
    if (event.pointerType === "touch" && state.penActive) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.pointerType === "pen") state.penActive = false;
    state.contacts.delete(event.pointerId);
    if (event.pointerType === "touch" && state.navigating) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (interactiveCanvas.hasPointerCapture(event.pointerId))
        interactiveCanvas.releasePointerCapture(event.pointerId);
      if (!state.contacts.size) state.navigating = false;
    }
    if (event.type === "pointercancel") {
      state.contacts.clear();
      state.navigating = false;
      state.penActive = false;
      historyStore.cancelCapture();
      toolManager.cancel();
      selectionController.cancelGesture();
      endGesturePreview();
      renderLoop.invalidateAll();
    }
  };
  return { touchDown, touchMove, touchEnd };
}

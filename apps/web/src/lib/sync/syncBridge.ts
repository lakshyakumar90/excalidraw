import type { PreviewWireElement } from "@repo/common";

/**
 * Bridge between the imperative canvas and RoomSync for ephemeral frames.
 * Drag previews and selections never enter the scene store, history,
 * IndexedDB, HTTP saves, or the committed outbox.
 */
export interface RoomSyncBridge {
  preview: (gestureId: string, seq: number, elements: PreviewWireElement[]) => void;
  endPreview: (gestureId: string) => void;
  select: (elementIds: readonly string[]) => void;
}

let bridge: RoomSyncBridge | null = null;

export function setRoomSyncBridge(next: RoomSyncBridge | null): void {
  bridge = next;
}

export function getRoomSyncBridge(): RoomSyncBridge | null {
  return bridge;
}

let activeGesture: { id: string; seq: number } | null = null;

/** Start tracking one local drag/create/resize gesture. */
export function beginGesturePreview(): string {
  activeGesture = { id: crypto.randomUUID(), seq: 0 };
  return activeGesture.id;
}

/** Publish the latest geometry for the active gesture (throttled by RoomSync). */
export function pushGesturePreview(elements: PreviewWireElement[]): void {
  if (!activeGesture || !bridge || elements.length === 0) return;
  activeGesture.seq += 1;
  bridge.preview(activeGesture.id, activeGesture.seq, elements);
}

/** End the active gesture, if any, and clear its remote ghosts. */
export function endGesturePreview(): void {
  if (!activeGesture) return;
  const { id } = activeGesture;
  activeGesture = null;
  bridge?.endPreview(id);
}

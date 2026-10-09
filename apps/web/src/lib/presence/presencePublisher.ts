import type { Point } from "@repo/common";

/**
 * Bridge between the imperative canvas and the presence hook.
 * Canvas publishes scene-space pointer positions here; the hook wires the
 * active connection's throttled publishers. Remote cursors never enter the
 * scene store, history, selection, or autosave data.
 */
export interface CanvasPresencePublisher {
  pointer: (point: Point) => void;
  leave: () => void;
}

let publisher: CanvasPresencePublisher | null = null;

export function setCanvasPresencePublisher(
  next: CanvasPresencePublisher | null,
): void {
  publisher = next;
}

export function getCanvasPresencePublisher(): CanvasPresencePublisher | null {
  return publisher;
}

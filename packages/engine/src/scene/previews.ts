export interface PreviewGeometry {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  points?: { x: number; y: number }[];
  text?: string;
}

export interface PreviewFrame {
  connectionId: string;
  gestureId: string;
  /** Monotonically increasing per gesture; late frames are ignored. */
  seq: number;
  elements: PreviewGeometry[];
  receivedAt: number;
}

export interface PreviewEntry extends PreviewFrame {
  key: string;
}

/**
 * Ephemeral remote-gesture previews. Never persisted, never versioned, never
 * part of undo. A preview never overrides an accepted final state: the sync
 * layer clears gestures on commit, end/cancel, leave, disconnect, and
 * reconnect, plus a bounded inactivity timeout driven by pruneOlderThan.
 */
export class PreviewStore {
  private entries = new Map<string, PreviewEntry>();
  private listeners = new Set<() => void>();
  private version = 0;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Monotonic counter for useSyncExternalStore subscriptions. */
  getSnapshot = (): number => {
    return this.version;
  };

  private notify(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  private key(connectionId: string, gestureId: string): string {
    return `${connectionId}:${gestureId}`;
  }

  /** Returns false when the frame is stale (seq behind the stored one). */
  setPreview(frame: PreviewFrame): boolean {
    const key = this.key(frame.connectionId, frame.gestureId);
    const existing = this.entries.get(key);
    if (existing && frame.seq <= existing.seq) return false;
    this.entries.set(key, { ...frame, key });
    this.notify();
    return true;
  }

  clearGesture(connectionId: string, gestureId: string): boolean {
    return this.deleteKey(this.key(connectionId, gestureId));
  }

  clearConnection(connectionId: string): boolean {
    let removed = false;
    for (const [key, entry] of this.entries) {
      if (entry.connectionId === connectionId) {
        this.entries.delete(key);
        removed = true;
      }
    }
    if (removed) this.notify();
    return removed;
  }

  clearAll(): boolean {
    if (this.entries.size === 0) return false;
    this.entries.clear();
    this.notify();
    return true;
  }

  pruneOlderThan(now: number, timeoutMs: number): boolean {
    let removed = false;
    for (const [key, entry] of this.entries) {
      if (now - entry.receivedAt > timeoutMs) {
        this.entries.delete(key);
        removed = true;
      }
    }
    if (removed) this.notify();
    return removed;
  }

  private deleteKey(key: string): boolean {
    if (!this.entries.has(key)) return false;
    this.entries.delete(key);
    this.notify();
    return true;
  }

  getPreviews(): PreviewEntry[] {
    return [...this.entries.values()];
  }

  get size(): number {
    return this.entries.size;
  }
}

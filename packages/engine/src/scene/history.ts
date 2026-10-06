import type { Element } from "@repo/common";
import { Scene, type SceneElementChange } from "./scene";

export type HistoryOrigin = "local" | "remote" | "undo" | "redo";

export interface HistoryEntry {
  changes: SceneElementChange[];
  beforeSelection: string[];
  afterSelection: string[];
  origin: HistoryOrigin;
}

function cloneData(value: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(value);
}

/** Keeps bounded, element-delta undo and redo stacks for one scene. */
export class HistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private captureOrigin: HistoryOrigin | null = null;
  private beforeSelection: string[] = [];
  private snapshot = { canUndo: false, canRedo: false };
  private listeners = new Set<() => void>();

  constructor(
    private readonly scene: Scene,
    private readonly getSelection: () => Iterable<string>,
    private readonly setSelection: (ids: Iterable<string>) => void,
    private readonly maxDepth = 300,
  ) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): { canUndo: boolean; canRedo: boolean } {
    return this.snapshot;
  }

  private notify(): void {
    this.snapshot = { canUndo: this.canUndo, canRedo: this.canRedo };
    for (const listener of this.listeners) listener();
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  startCapture(origin: HistoryOrigin = "local"): void {
    if (this.captureOrigin) {
      throw new Error("A history capture is already active");
    }
    this.scene.beginCapture();
    this.captureOrigin = origin;
    this.beforeSelection = [...this.getSelection()];
  }

  endCapture(): boolean {
    if (!this.captureOrigin) return false;
    const origin = this.captureOrigin;
    this.captureOrigin = null;
    const changes = this.scene.endCapture();
    if (changes.length === 0 || origin === "remote") return false;

    this.undoStack.push({
      changes,
      beforeSelection: this.beforeSelection,
      afterSelection: [...this.getSelection()],
      origin,
    });
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.redoStack = [];
    this.notify();
    return true;
  }

  captureUpdate<T>(action: () => T, origin: HistoryOrigin = "local"): T {
    this.startCapture(origin);
    try {
      return action();
    } finally {
      this.endCapture();
    }
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    for (const change of [...entry.changes].reverse()) {
      this.applyChange(change.id, change.before, change.beforeIndex);
    }
    this.restoreSelection(entry.beforeSelection);
    this.redoStack.push(entry);
    this.notify();
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    for (const change of entry.changes) {
      this.applyChange(change.id, change.after, change.afterIndex);
    }
    this.restoreSelection(entry.afterSelection);
    this.undoStack.push(entry);
    this.notify();
    return true;
  }

  private applyChange(
    id: string,
    target: Record<string, unknown> | null,
    targetIndex?: number,
  ): void {
    const current = this.scene.getElement(id);
    if (!target) {
      if (current && !current.isDeleted) {
        this.scene.mutateElement(id, { isDeleted: true });
      }
      return;
    }

    const next = cloneData(target);
    delete next.version;
    delete next.versionNonce;
    delete next.updated;
    if (current) {
      this.scene.mutateElement(id, {
        ...next,
        isDeleted:
          typeof next.isDeleted === "boolean" ? next.isDeleted : current.isDeleted,
      } as Partial<Omit<Element, "id" | "type">>);
      if (targetIndex !== undefined) {
        this.scene.moveElementToIndex(id, targetIndex);
      }
      return;
    }

    this.scene.addElement({ id, ...next } as Element);
    this.scene.mutateElement(id, {});
    if (targetIndex !== undefined) {
      this.scene.moveElementToIndex(id, targetIndex);
    }
  }

  private restoreSelection(ids: Iterable<string>): void {
    this.setSelection(
      [...ids].filter((id) => {
        const element = this.scene.getElement(id);
        return !!element && !element.isDeleted;
      }),
    );
  }
}

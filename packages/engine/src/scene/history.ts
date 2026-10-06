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
    if (changes.length === 0) return false;

    this.undoStack.push({
      changes,
      beforeSelection: this.beforeSelection,
      afterSelection: [...this.getSelection()],
      origin,
    });
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.redoStack = [];
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
      this.applyChange(change.id, change.before);
    }
    this.restoreSelection(entry.beforeSelection);
    this.redoStack.push(entry);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    for (const change of entry.changes) {
      this.applyChange(change.id, change.after);
    }
    this.restoreSelection(entry.afterSelection);
    this.undoStack.push(entry);
    return true;
  }

  private applyChange(id: string, target: Record<string, unknown> | null): void {
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
        isDeleted: false,
      } as Partial<Omit<Element, "id" | "type">>);
      return;
    }

    this.scene.addElement({ id, ...next } as Element);
    this.scene.mutateElement(id, {});
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

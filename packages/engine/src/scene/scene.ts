import type { Element } from "@repo/common";

export interface SceneElementChange {
  id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  beforeIndex?: number;
  afterIndex?: number;
}

interface PendingElementChange {
  before: Element | null;
  changedFields: Set<string>;
  beforeIndex?: number;
}

function cloneElement(element: Element): Element {
  return "points" in element
    ? ({ ...element, points: element.points.map((point) => ({ ...point })) } as Element)
    : { ...element };
}

function pickFields(
  element: Element,
  fields: Iterable<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { type: element.type };
  for (const field of fields) {
    if (field === "id" || field === "type") continue;
    const value = element[field as keyof Element];
    result[field] = Array.isArray(value) ? structuredClone(value) : value;
  }
  return result;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

type ElementMutation<T = Element> = T extends Element
  ? Partial<Omit<T, "id" | "type">>
  : never;

export type ZOrderAction = "backward" | "forward" | "back" | "front";

export class Scene {
  private elements: Element[] = [];
  private elementMap = new Map<string, Element>();
  private sceneVersion = 0;
  private dirty = false;
  private subscribers = new Set<() => void>();
  private pendingChanges: Map<string, PendingElementChange> | null = null;

  /** Starts collecting field deltas until endCapture is called. */
  beginCapture(): void {
    if (this.pendingChanges) {
      throw new Error("A scene history capture is already active");
    }
    this.pendingChanges = new Map();
  }

  /** Returns deltas only for changed elements; it never snapshots the scene. */
  endCapture(): SceneElementChange[] {
    const pending = this.pendingChanges;
    this.pendingChanges = null;
    if (!pending) return [];

    const changes: SceneElementChange[] = [];
    for (const [id, change] of pending) {
      const afterElement = this.elementMap.get(id) ?? null;
      if (!change.before && !afterElement) continue;

      if (change.before && afterElement) {
        const changedFields = [...change.changedFields].filter(
          (field) =>
            !valuesEqual(
              change.before![field as keyof Element],
              afterElement[field as keyof Element],
            ),
        );
        const afterIndex = this.elements.findIndex((element) => element.id === id);
        const indexChanged =
          change.beforeIndex !== undefined && change.beforeIndex !== afterIndex;
        if (changedFields.length === 0 && !indexChanged) continue;
        changes.push({
          id,
          before: pickFields(change.before, changedFields),
          after: pickFields(afterElement, changedFields),
          ...(indexChanged
            ? { beforeIndex: change.beforeIndex, afterIndex }
            : {}),
        });
        continue;
      }

      changes.push({
        id,
        before: change.before ? { ...cloneElement(change.before) } : null,
        after: afterElement ? { ...cloneElement(afterElement) } : null,
      });
    }
    return changes;
  }

  private recordChange(
    id: string,
    before: Element | null,
    fields: Iterable<string> = [],
  ): void {
    if (!this.pendingChanges) return;
    let change = this.pendingChanges.get(id);
    if (!change) {
      change = {
        before: before ? cloneElement(before) : null,
        changedFields: new Set(),
      };
      this.pendingChanges.set(id, change);
    }
    for (const field of fields) {
      if (field !== "id" && field !== "type") change.changedFields.add(field);
    }
  }

  addElement(element: Element): void {
    if (this.elementMap.has(element.id)) {
      throw new Error(`Element with id "${element.id}" already exists`);
    }
    this.recordChange(element.id, null);
    this.elements.push(element);
    this.elementMap.set(element.id, element);
    this.sceneVersion += 1;
    this.dirty = true;
    this.notify();
  }

  getElement(id: string): Element | undefined {
    return this.elementMap.get(id);
  }

  getElements(): readonly Element[] {
    return this.elements;
  }

  replaceAll(elements: readonly Element[]): void {
    const replacement = structuredClone([...elements]);
    const elementMap = new Map(replacement.map((element) => [element.id, element]));
    if (elementMap.size !== replacement.length) {
      throw new Error("Scene elements must have unique ids");
    }
    this.elements = replacement;
    this.elementMap = elementMap;
    this.sceneVersion += 1;
    this.dirty = true;
    this.notify();
  }

  /** Reorders selected elements while keeping their relative order intact. */
  reorderElements(ids: Iterable<string>, action: ZOrderAction): boolean {
    const selectedIds = new Set(
      [...ids].filter((id) => {
        const element = this.elementMap.get(id);
        return element !== undefined && !element.isDeleted;
      }),
    );
    if (selectedIds.size === 0) return false;

    const previous = this.elements;
    const next = previous.slice();

    if (action === "front" || action === "back") {
      const moved = next.filter((element) => selectedIds.has(element.id));
      const remaining = next.filter((element) => !selectedIds.has(element.id));
      next.splice(
        0,
        next.length,
        ...(action === "front"
          ? [...remaining, ...moved]
          : [...moved, ...remaining]),
      );
    } else if (action === "forward") {
      // Walk from front to back so each selected element crosses at most one
      // unselected element without changing the selected elements' order.
      for (let index = next.length - 2; index >= 0; index -= 1) {
        if (
          selectedIds.has(next[index]!.id) &&
          !selectedIds.has(next[index + 1]!.id)
        ) {
          [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
        }
      }
    } else {
      for (let index = 1; index < next.length; index += 1) {
        if (
          selectedIds.has(next[index]!.id) &&
          !selectedIds.has(next[index - 1]!.id)
        ) {
          [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
        }
      }
    }

    if (next.every((element, index) => element.id === previous[index]?.id)) {
      return false;
    }

    const previousIndexById = new Map(
      previous.map((element, index) => [element.id, index]),
    );
    const nextIndexById = new Map(
      next.map((element, index) => [element.id, index]),
    );
    for (const element of previous) {
      const beforeIndex = previousIndexById.get(element.id);
      const afterIndex = nextIndexById.get(element.id);
      if (
        selectedIds.has(element.id) &&
        beforeIndex !== undefined &&
        afterIndex !== undefined &&
        beforeIndex !== afterIndex
      ) {
        this.recordChange(element.id, element);
        const pending = this.pendingChanges?.get(element.id);
        if (pending) pending.beforeIndex = beforeIndex;
      }
    }
    const now = Date.now();
    for (const element of next) {
      if (
        selectedIds.has(element.id) &&
        previousIndexById.get(element.id) !== nextIndexById.get(element.id)
      ) {
        element.version =
          element.version === undefined ? 1 : element.version + 1;
        element.versionNonce = Math.floor(Math.random() * 2_147_483_647);
        element.updated = now;
      }
    }

    this.elements = next;
    this.sceneVersion += 1;
    this.dirty = true;
    this.notify();
    return true;
  }

  removeElement(id: string): boolean {
    const element = this.elementMap.get(id);

    if (!element) {
      return false;
    }
    this.recordChange(id, element);
    this.elementMap.delete(id);

    const index = this.elements.findIndex((item) => item.id === id);
    if (index !== -1) {
      this.elements.splice(index, 1);
    }

    this.sceneVersion += 1;
    this.dirty = true;
    this.notify();

    return true;
  }

  hasElement(id: string): boolean {
    return this.elementMap.has(id);
  }

  moveElementToIndex(id: string, index: number): boolean {
    const currentIndex = this.elements.findIndex((element) => element.id === id);
    if (currentIndex < 0) return false;
    const targetIndex = Math.max(0, Math.min(index, this.elements.length - 1));
    if (currentIndex === targetIndex) return false;
    const [element] = this.elements.splice(currentIndex, 1);
    if (!element) return false;
    this.elements.splice(targetIndex, 0, element);
    this.mutateElement(id, {});
    return true;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  };

  private notify(): void {
    for (const listener of this.subscribers) {
      listener();
    }
  }

  //Partial<Element> means you can provide only the properties you want to change.
  mutateElement(id: string, changes: ElementMutation): Element | undefined {
    const element = this.elementMap.get(id);
    if (!element) return undefined;

    this.recordChange(id, element, Object.keys(changes));

    Object.assign(element, changes);
    element.version = element.version === undefined ? 1 : element.version + 1;
    element.versionNonce = Math.floor(Math.random() * 2_147_483_647);
    element.updated = Date.now();
    this.sceneVersion += 1;
    this.dirty = true;
    this.notify();
    return element;
  }

  get version(): number {
    return this.sceneVersion;
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  get size(): number {
    return this.elements.length;
  }

  getSnapshot = (): number => {
    return this.sceneVersion;
  };

  markClean(): void {
    this.dirty = false;
  }
}

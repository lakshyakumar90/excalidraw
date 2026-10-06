import type { Element } from "@repo/common";

type ElementMutation = Partial<Omit<Element, "id" | "type">>;

export type ZOrderAction = "backward" | "forward" | "back" | "front";

export class Scene {
  private elements: Element[] = [];
  private elementMap = new Map<string, Element>();
  private sceneVersion = 0;
  private dirty = false;
  private subscribers = new Set<() => void>();

  addElement(element: Element): void {
    if (this.elementMap.has(element.id)) {
      throw new Error(`Element with id "${element.id}" already exists`);
    }
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

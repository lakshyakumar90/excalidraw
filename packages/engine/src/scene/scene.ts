import type { Element } from "@repo/common";

type ElementMutation = Partial<Omit<Element, "id" | "type">>;

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

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

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

  markClean(): void {
    this.dirty = false;
  }
}

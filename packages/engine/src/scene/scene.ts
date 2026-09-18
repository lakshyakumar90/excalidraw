import type { Element } from "@repo/common";

export class Scene {
  private elements: Element[] = [];

  private elementMap = new Map<string, Element>();

  addElement(element: Element): void {
    if (this.elementMap.has(element.id)) {
      throw new Error(`Element with id "${element.id}" already exists`);
    }
    this.elements.push(element);
    this.elementMap.set(element.id, element);
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

    return true;
  }

  get size(): number {
    return this.elements.length;
  }
  
  hasElement(id: string): boolean {
    return this.elementMap.has(id);
  }
}

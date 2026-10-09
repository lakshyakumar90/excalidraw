import type { Element } from "@repo/common";
import { getArrowMidpoint, measureText } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { syncBoundArrowsForShape } from "./arrowBinding";

function getBoundMovementElements(element: Element): Element[] {
  const related = new Map<string, Element>();

  if (element.type === "text" && element.containerId) {
    const container = scene.getElement(element.containerId);
    if (container && !container.isDeleted) related.set(container.id, container);
  }

  for (const id of element.boundElements ?? []) {
    const bound = scene.getElement(id);
    if (
      bound?.type === "text" &&
      bound.containerId === element.id &&
      !bound.isDeleted
    ) {
      related.set(bound.id, bound);
    }
  }

  if (element.type === "frame") {
    for (const child of scene.getElements())
      if (child.frameId === element.id && !child.isDeleted)
        related.set(child.id, child);
  }
  return [...related.values()];
}

export function getMovementSnapshots(
  elements: readonly Element[],
): Array<{ id: string; x: number; y: number }> {
  const snapshots = new Map<string, { id: string; x: number; y: number }>();
  const pending = [...elements];

  while (pending.length > 0) {
    const element = pending.pop();
    if (!element || snapshots.has(element.id)) continue;
    snapshots.set(element.id, {
      id: element.id,
      x: element.x,
      y: element.y,
    });
    pending.push(...getBoundMovementElements(element));
  }

  return [...snapshots.values()];
}

export function translateSnapshots(
  elements: readonly { id: string; x: number; y: number }[],
  dx: number,
  dy: number,
): void {
  for (const element of elements) {
    scene.mutateElement(element.id, {
      x: element.x + dx,
      y: element.y + dy,
    });
  }
  for (const element of elements) {
    const moved = scene.getElement(element.id);
    if (moved) syncBoundArrowsForShape(moved);
  }
}

export function syncBoundTextToContainer(container: Element): void {
  if (container.type !== "rectangle" && container.type !== "arrow") return;

  const boundTexts = (container.boundElements ?? [])
    .map((id) => scene.getElement(id))
    .filter(
      (element): element is Extract<Element, { type: "text" }> =>
        element?.type === "text" &&
        element.containerId === container.id &&
        !element.isDeleted,
    );
  let height = container.height ?? 0;
  if (container.type === "rectangle") {
    const wrappedHeight = Math.max(
      0,
      ...boundTexts.map(
        (text) =>
          measureText(
            text.text,
            text.fontSize,
            text.fontFamily,
            container.width ?? 0,
          ).height,
      ),
    );
    height = Math.max(height, wrappedHeight);

    if (height > (container.height ?? 0)) {
      scene.mutateElement(container.id, { height });
    }
  }

  for (const text of boundTexts) {
    if (container.type === "rectangle") {
      scene.mutateElement(text.id, {
        x: container.x,
        y: container.y,
        width: container.width,
        height,
        angle: container.angle,
      });
    } else {
      const midpoint = getArrowMidpoint(container);
      const metrics = measureText(text.text, text.fontSize, text.fontFamily);
      const width = Math.max(20, metrics.width);
      scene.mutateElement(text.id, {
        x: midpoint.x - width / 2,
        y: midpoint.y - metrics.height / 2,
        width,
        height: metrics.height,
        angle: 0,
      });
    }
  }
}

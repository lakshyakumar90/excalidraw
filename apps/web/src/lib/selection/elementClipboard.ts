import type { Element } from "@repo/common";

export const ELEMENTS_CLIPBOARD_MARKER = "excalidraw-elements";
export const ELEMENTS_CLIPBOARD_VERSION = 1;

export function cloneElement(element: Element): Element {
  if ("points" in element) {
    return {
      ...element,
      points: element.points.map((point) => ({ ...point })),
    } as Element;
  }

  return { ...element };
}

export function duplicateElements(
  elements: readonly Element[],
  offsetX: number,
  offsetY: number,
): Element[] {
  const elementIdMap = new Map(
    elements.map((element) => [element.id, crypto.randomUUID()]),
  );
  const groupIdMap = new Map<string, string>();
  for (const element of elements) {
    for (const groupId of element.groupIds ?? []) {
      if (!groupIdMap.has(groupId)) {
        groupIdMap.set(groupId, crypto.randomUUID());
      }
    }
  }

  const now = Date.now();
  return elements.map((element) => {
    const duplicate = {
      ...cloneElement(element),
      id: elementIdMap.get(element.id)!,
      x: element.x + offsetX,
      y: element.y + offsetY,
      orderKey: undefined,
      version: 1,
      versionNonce: Math.floor(Math.random() * 2_147_483_647),
      updated: now,
    } as Element;

    if (element.groupIds) {
      duplicate.groupIds = element.groupIds.map((groupId) =>
        groupIdMap.get(groupId)!,
      );
    }
    if (element.boundElements) {
      duplicate.boundElements = element.boundElements.flatMap((id) => {
        const mappedId = elementIdMap.get(id);
        return mappedId ? [mappedId] : [];
      });
    }
    if (element.frameId) {
      duplicate.frameId = elementIdMap.get(element.frameId) ?? null;
    }
    if (
      element.type === "text" &&
      duplicate.type === "text" &&
      element.containerId
    ) {
      duplicate.containerId = elementIdMap.get(element.containerId);
    }

    if (element.type === "arrow" && duplicate.type === "arrow") {
      for (const bindingKey of ["startBinding", "endBinding"] as const) {
        const binding = element[bindingKey];
        const mappedTargetId = binding
          ? elementIdMap.get(binding.elementId)
          : undefined;
        if (binding && mappedTargetId) {
          duplicate[bindingKey] = {
            ...binding,
            elementId: mappedTargetId,
          };
        } else {
          delete duplicate[bindingKey];
        }
      }
    }

    return duplicate;
  });
}

export function parseCopiedElements(text: string): Element[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  if (
    data.type !== ELEMENTS_CLIPBOARD_MARKER ||
    data.version !== ELEMENTS_CLIPBOARD_VERSION ||
    !Array.isArray(data.elements)
  ) {
    return null;
  }

  const elements = data.elements;
  if (!elements.every(isClipboardElement)) return null;
  const ids = elements.map((element) => element.id);
  if (new Set(ids).size !== ids.length) return null;
  return elements;
}

function isClipboardElement(value: unknown): value is Element {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    ![
      "frame",
      "rectangle",
      "ellipse",
      "diamond",
      "line",
      "arrow",
      "freedraw",
      "text",
    ].includes(value.type) ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y)
  ) {
    return false;
  }

  for (const key of [
    "width",
    "height",
    "angle",
    "strokeWidth",
    "roughness",
    "opacity",
    "seed",
    "version",
    "versionNonce",
    "updated",
  ]) {
    if (value[key] !== undefined && !isFiniteNumber(value[key])) return false;
  }
  if (
    value.groupIds !== undefined &&
    (!Array.isArray(value.groupIds) || !value.groupIds.every(isString))
  ) {
    return false;
  }
  if (
    value.boundElements !== undefined &&
    (!Array.isArray(value.boundElements) ||
      !value.boundElements.every(isString))
  ) {
    return false;
  }
  if (value.containerId !== undefined && !isString(value.containerId)) {
    return false;
  }
  if (
    value.frameId !== undefined &&
    value.frameId !== null &&
    typeof value.frameId !== "string"
  ) {
    return false;
  }

  if (
    value.type === "line" ||
    value.type === "arrow" ||
    value.type === "freedraw"
  ) {
    if (
      !Array.isArray(value.points) ||
      !value.points.every((point: unknown) => {
        if (
          !isRecord(point) ||
          !isFiniteNumber(point.x) ||
          !isFiniteNumber(point.y)
        ) {
          return false;
        }
        return value.type !== "freedraw" || isFiniteNumber(point.pressure);
      })
    ) {
      return false;
    }
    if (
      value.type === "line" &&
      value.lineType !== "straight" &&
      value.lineType !== "curved"
    ) {
      return false;
    }
  }

  if (
    value.type === "arrow" &&
    ((value.lineType !== undefined &&
      value.lineType !== "straight" &&
      value.lineType !== "curved") ||
      (value.startBinding !== undefined &&
        !isArrowBindingValue(value.startBinding)) ||
      (value.endBinding !== undefined &&
        !isArrowBindingValue(value.endBinding)))
  ) {
    return false;
  }

  if (
    value.type === "text" &&
    (typeof value.text !== "string" ||
      !isFiniteNumber(value.fontSize) ||
      typeof value.fontFamily !== "string" ||
      !["left", "center", "right"].includes(String(value.textAlign)) ||
      !["top", "middle", "bottom"].includes(String(value.verticalAlign)))
  ) {
    return false;
  }

  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isArrowBindingValue(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return (
    typeof value.elementId === "string" &&
    isFiniteNumber(value.focus) &&
    (value.gap === undefined || isFiniteNumber(value.gap)) &&
    (value.fixedPoint === undefined ||
      (Array.isArray(value.fixedPoint) &&
        value.fixedPoint.length === 2 &&
        value.fixedPoint.every(isFiniteNumber)))
  );
}

import type { Element, Viewport } from "@repo/common";
import { historyStore } from "@/lib/history/historyStore";
import { scene } from "@/lib/scene/scene";
import { selectionStore } from "@/lib/selection/selectionStore";
import { setCurrentViewport } from "./viewportStore";

const ELEMENT_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "freedraw",
  "text",
]);

export interface ImportedDocument {
  elements: Element[];
  viewport: Viewport;
  files: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateElement(value: unknown): value is Element {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.type !== "string" ||
    !ELEMENT_TYPES.has(value.type) ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y)
  ) {
    return false;
  }
  if (value.width !== undefined && !isFiniteNumber(value.width)) return false;
  if (value.height !== undefined && !isFiniteNumber(value.height)) return false;
  if (["line", "arrow", "freedraw"].includes(value.type)) {
    if (
      !Array.isArray(value.points) ||
      value.points.length === 0 ||
      !value.points.every(
        (point) =>
          isRecord(point) &&
          isFiniteNumber(point.x) &&
          isFiniteNumber(point.y) &&
          (value.type !== "freedraw" || isFiniteNumber(point.pressure)),
      )
    ) {
      return false;
    }
  }
  if (
    value.type === "text" &&
    (typeof value.text !== "string" ||
      !isFiniteNumber(value.fontSize) ||
      typeof value.fontFamily !== "string")
  ) {
    return false;
  }
  return true;
}

export function parseExcalidrawDocument(value: unknown): ImportedDocument {
  if (
    !isRecord(value) ||
    value.type !== "excalidraw" ||
    ![1, 2].includes(Number(value.version)) ||
    !Array.isArray(value.elements) ||
    !value.elements.every(validateElement)
  ) {
    throw new Error("This is not a supported .excalidraw file");
  }

  const ids = new Set<string>();
  for (const element of value.elements) {
    if (ids.has(element.id)) {
      throw new Error("This drawing contains duplicate element ids");
    }
    ids.add(element.id);
  }

  const appState = isRecord(value.appState) ? value.appState : {};
  const rawZoom = appState.zoom;
  const zoom = isRecord(rawZoom) ? rawZoom.value : rawZoom;
  const viewport: Viewport = {
    scrollX: isFiniteNumber(appState.scrollX) ? appState.scrollX : 0,
    scrollY: isFiniteNumber(appState.scrollY) ? appState.scrollY : 0,
    zoom: isFiniteNumber(zoom) && zoom > 0 ? zoom : 1,
  };
  const files = isRecord(value.files) ? value.files : {};

  return {
    elements: structuredClone(value.elements) as Element[],
    viewport,
    files,
  };
}

export async function readExcalidrawFile(file: File): Promise<ImportedDocument> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error("The selected file is not valid JSON");
  }
  return parseExcalidrawDocument(parsed);
}

export function applyImportedDocument(document: ImportedDocument): void {
  scene.replaceAll(document.elements);
  selectionStore.clear();
  historyStore.clear();
  setCurrentViewport(document.viewport);
}

export function publishImportStatus(message: string | null): void {
  window.dispatchEvent(
    new CustomEvent("excalidraw-import-status", { detail: message }),
  );
}

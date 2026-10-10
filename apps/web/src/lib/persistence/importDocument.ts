import type { Element, Viewport } from "@repo/common";
import { historyStore } from "@/lib/history/historyStore";
import { scene } from "@/lib/scene/scene";
import { selectionStore } from "@/lib/selection/selectionStore";
import { saveFile } from "./indexedDb";
import { setCurrentViewport } from "./viewportStore";

const ELEMENT_TYPES = new Set([
  "frame",
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "freedraw",
  "text",
  "image",
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
  if (value.type === "image" && typeof value.fileId !== "string") return false;
  return true;
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
  for (const element of value.elements) {
    if (element.type === "image") {
      const file = files[element.fileId];
      if (!isRecord(file) || typeof file.dataURL !== "string") {
        throw new Error(`The image file "${element.fileId}" is missing`);
      }
    }
  }

  const elements = structuredClone(value.elements) as Element[];
  for (let index = 0; index < elements.length; index++) {
    const e = elements[index]!;
    if (e.type === "frame" && (e.frameId || (e.angle ?? 0) !== 0)) {
      delete e.name;
      elements[index] = { ...e, type: "rectangle", frameId: null };
    }
  }
  const frames = new Set(
    elements.filter((e) => e.type === "frame" && !e.isDeleted).map((e) => e.id),
  );
  for (const e of elements)
    if (e.frameId && !frames.has(e.frameId)) e.frameId = null;
  return {
    elements,
    viewport,
    files,
  };
}

export async function readExcalidrawFile(
  file: File,
): Promise<ImportedDocument> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error("The selected file is not valid JSON");
  }
  return parseExcalidrawDocument(parsed);
}

function dataUrlToBlob(dataUrl: string, expectedMimeType?: string): Blob {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new Error("An imported image has invalid file data");
  const mimeType = match[1] || expectedMimeType || "application/octet-stream";
  const payload = match[3] ?? "";
  const bytes = match[2]
    ? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return new Blob([bytes], { type: mimeType });
}

export async function applyImportedDocument(
  document: ImportedDocument,
): Promise<void> {
  for (const [fileId, rawFile] of Object.entries(document.files)) {
    if (!isRecord(rawFile) || typeof rawFile.dataURL !== "string") continue;
    const blob = dataUrlToBlob(
      rawFile.dataURL,
      typeof rawFile.mimeType === "string" ? rawFile.mimeType : undefined,
    );
    const mimeType =
      typeof rawFile.mimeType === "string" ? rawFile.mimeType : blob.type;
    await saveFile({
      id: fileId,
      blob,
      mimeType,
      created: isFiniteNumber(rawFile.created) ? rawFile.created : Date.now(),
    });
  }
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

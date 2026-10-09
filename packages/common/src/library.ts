import type { Element } from "./element/index.js";
import { validateSyncElement } from "./syncValidate.js";

export interface LibraryFile {
  id: string;
  mimeType: string;
  dataURL: string;
  created: number;
}
export interface LibraryStamp {
  version: 1;
  elements: Element[];
  files: Record<string, LibraryFile>;
}
export interface LibrarySummary {
  id: string;
  name: string;
  updatedAt: string;
}
export interface LibraryItem extends LibrarySummary {
  data: LibraryStamp;
}
export const LIBRARY_MAX_BYTES = 20 * 1024 * 1024;

export function validateLibraryStamp(value: unknown): value is LibraryStamp {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    v.version !== 1 ||
    !Array.isArray(v.elements) ||
    v.elements.length === 0 ||
    v.elements.length > 1000 ||
    !v.files ||
    typeof v.files !== "object" ||
    Array.isArray(v.files)
  )
    return false;
  try {
    if (new TextEncoder().encode(JSON.stringify(v)).length > LIBRARY_MAX_BYTES)
      return false;
  } catch {
    return false;
  }
  const ids = new Set<string>();
  for (const raw of v.elements) {
    const parsed = validateSyncElement(raw);
    if (!parsed.ok || ids.has(parsed.element.id)) return false;
    ids.add(parsed.element.id);
  }
  for (const [id, raw] of Object.entries(v.files)) {
    if (!raw || typeof raw !== "object") return false;
    const f = raw as Record<string, unknown>;
    if (
      ["__proto__", "prototype", "constructor"].includes(id) ||
      f.id !== id ||
      typeof f.mimeType !== "string" ||
      !/^image\/(png|jpeg|webp|gif)$/.test(f.mimeType) ||
      typeof f.dataURL !== "string" ||
      !f.dataURL.startsWith(`data:${f.mimeType};base64,`) ||
      !Number.isFinite(f.created) ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(
        f.dataURL.slice(f.dataURL.indexOf(",") + 1),
      )
    )
      return false;
  }
  for (const raw of v.elements as Element[]) {
    if (
      raw.frameId &&
      !(v.elements as Element[]).some(
        (e) => e.id === raw.frameId && e.type === "frame" && !e.isDeleted,
      )
    )
      return false;
    if (raw.boundElements?.some((id) => !ids.has(id))) return false;
    if (raw.type === "text" && raw.containerId && !ids.has(raw.containerId))
      return false;
    if (
      raw.type === "arrow" &&
      [raw.startBinding, raw.endBinding].some((b) => b && !ids.has(b.elementId))
    )
      return false;
    if (raw.type === "image" && !(raw.fileId in v.files)) return false;
  }
  return true;
}

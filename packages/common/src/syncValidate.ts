import type { Element } from "./element/index.js";
import {
  SYNC_MAX_COMMIT_ELEMENTS,
  SYNC_MAX_ID_LENGTH,
  SYNC_MAX_NONCE,
  SYNC_MAX_ORDER_KEY,
  SYNC_MAX_POINTS_PER_ELEMENT,
  SYNC_MAX_TEXT_LENGTH,
  SYNC_MAX_VERSION,
  normalizeElement,
  type NormalizedElement,
} from "./sync.js";

/**
 * Strict wire validation for sync element records (Phase 15).
 *
 * Browser-safe and shared: the WS server and the HTTP merge path reject
 * invalid records before reconciliation; the browser validates incoming
 * snapshots/deltas before applying them. Never throws for malformed input.
 */

const MAX_GEOMETRY = 10_000_000;
const MAX_STYLE_STRING = 100;
const MAX_ARRAY_REF = 50;

const BASE_KEYS = new Set([
  "id",
  "type",
  "x",
  "y",
  "width",
  "height",
  "angle",
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeStyle",
  "edgeStyle",
  "strokeWidth",
  "roughness",
  "opacity",
  "seed",
  "groupIds",
  "boundElements",
  "frameId",
  "version",
  "versionNonce",
  "isDeleted",
  "updated",
  "orderKey",
]);

const TYPE_KEYS: Record<string, string[]> = {
  frame: ["name"],
  rectangle: [],
  ellipse: [],
  diamond: [],
  line: ["lineType", "points"],
  arrow: ["lineType", "points", "startBinding", "endBinding"],
  freedraw: ["points"],
  text: [
    "text",
    "containerId",
    "wrapText",
    "fontSize",
    "fontFamily",
    "textAlign",
    "verticalAlign",
  ],
  image: ["fileId", "status", "scale", "crop"],
};

const FILL_STYLES = new Set(["solid", "hachure", "cross-hatch", "none"]);
const STROKE_STYLES = new Set(["solid", "dashed", "dotted"]);
const EDGE_STYLES = new Set(["sharp", "rounded"]);
const LINE_TYPES = new Set(["straight", "curved"]);
const TEXT_ALIGNS = new Set(["left", "center", "right"]);
const VERTICAL_ALIGNS = new Set(["top", "middle", "bottom"]);
const IMAGE_STATUS = new Set(["pending", "saved", "error"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isGeometry(value: unknown): value is number {
  return isFiniteNumber(value) && Math.abs(value) <= MAX_GEOMETRY;
}

function isIdString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= SYNC_MAX_ID_LENGTH
  );
}

function isIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_ARRAY_REF &&
    value.every(isIdString)
  );
}

function isBinding(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (!isRecord(value)) return false;
  if (!isIdString(value.elementId)) return false;
  if (!isFiniteNumber(value.focus)) return false;
  if (value.gap !== undefined && !isFiniteNumber(value.gap)) return false;
  if (value.fixedPoint !== undefined) {
    if (
      !Array.isArray(value.fixedPoint) ||
      value.fixedPoint.length !== 2 ||
      !value.fixedPoint.every(isFiniteNumber)
    ) {
      return false;
    }
  }
  return Object.keys(value).every((key) =>
    ["elementId", "focus", "gap", "fixedPoint"].includes(key),
  );
}

function isPointRecord(value: unknown, withPressure: boolean): boolean {
  if (!isRecord(value)) return false;
  if (!isGeometry(value.x) || !isGeometry(value.y)) return false;
  if (withPressure && !isFiniteNumber(value.pressure)) return false;
  const keys = Object.keys(value);
  const allowed = withPressure ? ["x", "y", "pressure"] : ["x", "y"];
  return keys.every((key) => allowed.includes(key));
}

function isPoints(value: unknown, withPressure: boolean): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= SYNC_MAX_POINTS_PER_ELEMENT &&
    value.every((point) => isPointRecord(point, withPressure))
  );
}

export type SyncValidationResult =
  { ok: true; element: NormalizedElement } | { ok: false; error: string };

/** Validate one untrusted element record; returns a normalized clone. */
export function validateSyncElement(value: unknown): SyncValidationResult {
  if (!isRecord(value))
    return { ok: false, error: "Element must be an object" };
  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return { ok: false, error: "Unsafe element field" };
    }
  }
  if (typeof value.type !== "string" || !(value.type in TYPE_KEYS)) {
    return { ok: false, error: "Unknown element type" };
  }
  const allowed = new Set([...BASE_KEYS, ...TYPE_KEYS[value.type]!]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key))
      return { ok: false, error: `Unexpected field ${key}` };
  }
  if (!isIdString(value.id)) return { ok: false, error: "Invalid element id" };
  if (!isGeometry(value.x) || !isGeometry(value.y)) {
    return { ok: false, error: "Invalid element position" };
  }
  for (const field of ["width", "height"] as const) {
    const numeric = value[field];
    if (
      numeric !== undefined &&
      (!isFiniteNumber(numeric) || numeric < 0 || numeric > MAX_GEOMETRY)
    ) {
      return { ok: false, error: `Invalid element ${field}` };
    }
  }
  if (value.angle !== undefined && !isFiniteNumber(value.angle)) {
    return { ok: false, error: "Invalid element angle" };
  }
  for (const field of [
    "strokeColor",
    "backgroundColor",
    "fontFamily",
  ] as const) {
    const text = value[field];
    if (
      text !== undefined &&
      (typeof text !== "string" || text.length > MAX_STYLE_STRING)
    ) {
      return { ok: false, error: `Invalid element ${field}` };
    }
  }
  if (
    value.fillStyle !== undefined &&
    !FILL_STYLES.has(value.fillStyle as string)
  ) {
    return { ok: false, error: "Invalid fill style" };
  }
  if (
    value.strokeStyle !== undefined &&
    !STROKE_STYLES.has(value.strokeStyle as string)
  ) {
    return { ok: false, error: "Invalid stroke style" };
  }
  if (
    value.edgeStyle !== undefined &&
    !EDGE_STYLES.has(value.edgeStyle as string)
  ) {
    return { ok: false, error: "Invalid edge style" };
  }
  for (const field of ["strokeWidth", "roughness", "seed"] as const) {
    if (value[field] !== undefined && !isFiniteNumber(value[field])) {
      return { ok: false, error: `Invalid element ${field}` };
    }
  }
  if (
    value.opacity !== undefined &&
    (!isFiniteNumber(value.opacity) || value.opacity < 0 || value.opacity > 100)
  ) {
    return { ok: false, error: "Invalid element opacity" };
  }
  if (value.groupIds !== undefined && !isIdList(value.groupIds)) {
    return { ok: false, error: "Invalid group references" };
  }
  if (value.boundElements !== undefined && !isIdList(value.boundElements)) {
    return { ok: false, error: "Invalid bound references" };
  }
  if (
    value.frameId !== undefined &&
    value.frameId !== null &&
    !isIdString(value.frameId)
  ) {
    return { ok: false, error: "Invalid frame reference" };
  }
  if (value.isDeleted !== undefined && typeof value.isDeleted !== "boolean") {
    return { ok: false, error: "Invalid deletion flag" };
  }
  if (
    value.updated !== undefined &&
    (!isFiniteNumber(value.updated) || value.updated < 0)
  ) {
    return { ok: false, error: "Invalid update time" };
  }
  if (
    value.orderKey !== undefined &&
    (!isFiniteNumber(value.orderKey) ||
      Math.abs(value.orderKey) > SYNC_MAX_ORDER_KEY)
  ) {
    return { ok: false, error: "Invalid order key" };
  }

  switch (value.type) {
    case "frame":
      if (
        (value.angle ?? 0) !== 0 ||
        value.frameId ||
        (value.name !== undefined &&
          (typeof value.name !== "string" || value.name.length > 100))
      )
        return { ok: false, error: "Invalid frame" };
      break;
    case "line":
      if (!LINE_TYPES.has(value.lineType as string)) {
        return { ok: false, error: "Invalid line type" };
      }
      if (!isPoints(value.points, false)) {
        return { ok: false, error: "Invalid line points" };
      }
      break;
    case "arrow":
      if (
        value.lineType !== undefined &&
        !LINE_TYPES.has(value.lineType as string)
      ) {
        return { ok: false, error: "Invalid line type" };
      }
      if (!isPoints(value.points, false)) {
        return { ok: false, error: "Invalid arrow points" };
      }
      if (!isBinding(value.startBinding) || !isBinding(value.endBinding)) {
        return { ok: false, error: "Invalid arrow binding" };
      }
      break;
    case "freedraw":
      if (!isPoints(value.points, true)) {
        return { ok: false, error: "Invalid freedraw points" };
      }
      break;
    case "text": {
      if (
        typeof value.text !== "string" ||
        value.text.length > SYNC_MAX_TEXT_LENGTH
      ) {
        return { ok: false, error: "Invalid text content" };
      }
      if (
        !isFiniteNumber(value.fontSize) ||
        value.fontSize <= 0 ||
        value.fontSize > 500
      ) {
        return { ok: false, error: "Invalid font size" };
      }
      if (
        typeof value.fontFamily !== "string" ||
        value.fontFamily.length === 0
      ) {
        return { ok: false, error: "Invalid font family" };
      }
      if (!TEXT_ALIGNS.has(value.textAlign as string)) {
        return { ok: false, error: "Invalid text alignment" };
      }
      if (!VERTICAL_ALIGNS.has(value.verticalAlign as string)) {
        return { ok: false, error: "Invalid vertical alignment" };
      }
      if (value.containerId !== undefined && !isIdString(value.containerId)) {
        return { ok: false, error: "Invalid container reference" };
      }
      if (value.wrapText !== undefined && typeof value.wrapText !== "boolean") {
        return { ok: false, error: "Invalid wrap flag" };
      }
      break;
    }
    case "image": {
      if (!isIdString(value.fileId)) {
        return { ok: false, error: "Invalid file reference" };
      }
      if (
        value.status !== undefined &&
        !IMAGE_STATUS.has(value.status as string)
      ) {
        return { ok: false, error: "Invalid image status" };
      }
      if (value.scale !== undefined) {
        if (
          !Array.isArray(value.scale) ||
          value.scale.length !== 2 ||
          !value.scale.every(isFiniteNumber)
        ) {
          return { ok: false, error: "Invalid image scale" };
        }
      }
      if (value.crop !== undefined && value.crop !== null) {
        if (
          !isRecord(value.crop) ||
          !["x", "y", "width", "height"].every((key) =>
            isFiniteNumber((value.crop as Record<string, unknown>)[key]),
          ) ||
          Object.keys(value.crop).length !== 4
        ) {
          return { ok: false, error: "Invalid image crop" };
        }
      }
      break;
    }
    default:
      break;
  }

  const normalized = normalizeElement(value as unknown as Element, {
    strict: true,
    orderFallback: 0,
  });
  if (!normalized) return { ok: false, error: "Invalid version metadata" };
  if (normalized.version < 1 || normalized.version > SYNC_MAX_VERSION) {
    return { ok: false, error: "Invalid version metadata" };
  }
  if (normalized.versionNonce < 0 || normalized.versionNonce > SYNC_MAX_NONCE) {
    return { ok: false, error: "Invalid version metadata" };
  }
  return { ok: true, element: normalized };
}

export type BatchValidationResult =
  { ok: true; elements: NormalizedElement[] } | { ok: false; error: string };

/** Validate a bounded commit batch: array, size, duplicates, then records. */
export function validateSyncBatch(
  value: unknown,
  maxElements: number = SYNC_MAX_COMMIT_ELEMENTS,
): BatchValidationResult {
  if (!Array.isArray(value))
    return { ok: false, error: "Commit must be an array" };
  if (value.length === 0)
    return { ok: false, error: "Commit must not be empty" };
  if (value.length > maxElements) {
    return { ok: false, error: "Commit batch too large" };
  }
  const seen = new Set<string>();
  const elements: NormalizedElement[] = [];
  for (const entry of value) {
    const result = validateSyncElement(entry);
    if (!result.ok) return result;
    if (seen.has(result.element.id)) {
      return { ok: false, error: "Duplicate element in commit" };
    }
    seen.add(result.element.id);
    elements.push(result.element);
  }
  return { ok: true, elements };
}

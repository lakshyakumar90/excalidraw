import { MAX_ZOOM, MIN_ZOOM } from "./constants.js";

/**
 * Presence-only realtime protocol (Phase 14).
 *
 * These types are a compile-time contract shared by the browser, the HTTP
 * ticket endpoint, and the WebSocket server. No element, file, image, chat,
 * or scene-snapshot payload may travel over these messages.
 */

/** Stable subprotocol selected during the WebSocket handshake. */
export const PRESENCE_WS_PROTOCOL = "excalidraw-presence.v1";
/** Prefix for the ticket entry in `Sec-WebSocket-Protocol`. */
export const PRESENCE_TICKET_PROTOCOL_PREFIX = "auth.";

/** Presence-only limits shared by every transport. */
export const PRESENCE_THROTTLE_MS = 33;
export const PRESENCE_MAX_COORDINATE = 10_000_000;
export const PRESENCE_MIN_ZOOM = MIN_ZOOM;
export const PRESENCE_MAX_ZOOM = MAX_ZOOM;

export interface PresencePointer {
  x: number;
  y: number;
}

export interface PresenceViewport {
  /** Scene-space center the participant is viewing. */
  x: number;
  y: number;
  zoom: number;
}

export interface PresenceParticipant {
  connectionId: string;
  userId: string;
  displayName: string;
  pointer?: PresencePointer;
  viewport?: PresenceViewport;
}

export type ClientToServerPresenceMessage =
  | { type: "pointer.move"; x: number; y: number }
  | { type: "viewport.update"; x: number; y: number; zoom: number }
  | { type: "pointer.leave" };

export type ServerToClientPresenceMessage =
  | { type: "presence.snapshot"; participants: PresenceParticipant[] }
  | { type: "presence.joined"; participant: PresenceParticipant }
  | { type: "presence.left"; connectionId: string; userId: string }
  | { type: "pointer.move"; connectionId: string; userId: string; x: number; y: number }
  | {
      type: "viewport.update";
      connectionId: string;
      userId: string;
      x: number;
      y: number;
      zoom: number;
    }
  | { type: "error"; message: string };

export const CLIENT_MESSAGE_TYPES = [
  "pointer.move",
  "viewport.update",
  "pointer.leave",
] as const;

export type ClientMessageType = (typeof CLIENT_MESSAGE_TYPES)[number];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidSceneCoordinate(value: unknown): value is number {
  return (
    isFiniteNumber(value) && Math.abs(value) <= PRESENCE_MAX_COORDINATE
  );
}

function isValidZoom(value: unknown): value is number {
  return (
    isFiniteNumber(value) &&
    value >= PRESENCE_MIN_ZOOM &&
    value <= PRESENCE_MAX_ZOOM
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate an untrusted client payload at the WebSocket boundary.
 * Returns the typed message on success or a short error reason otherwise.
 * Never throws for malformed input.
 */
export function validateClientPresenceMessage(
  value: unknown,
): { ok: true; message: ClientToServerPresenceMessage } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "Message must be an object" };
  if (typeof value.type !== "string")
    return { ok: false, error: "Unknown message type" };
  // Reject unknown fields that could smuggle element/scene data.
  const allowedKeys: Record<ClientMessageType, readonly string[]> = {
    "pointer.move": ["type", "x", "y"],
    "viewport.update": ["type", "x", "y", "zoom"],
    "pointer.leave": ["type"],
  };
  if (
    value.type !== "pointer.move" &&
    value.type !== "viewport.update" &&
    value.type !== "pointer.leave"
  ) {
    return { ok: false, error: "Unknown message type" };
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys[value.type].includes(key)) {
      return { ok: false, error: "Unexpected field in message" };
    }
  }
  if (value.type === "pointer.leave") return { ok: true, message: { type: "pointer.leave" } };
  if (!isValidSceneCoordinate(value.x) || !isValidSceneCoordinate(value.y)) {
    return { ok: false, error: "Invalid pointer coordinates" };
  }
  if (value.type === "pointer.move") {
    return { ok: true, message: { type: "pointer.move", x: value.x, y: value.y } };
  }
  if (!isValidZoom(value.zoom)) {
    return { ok: false, error: "Invalid viewport zoom" };
  }
  return {
    ok: true,
    message: { type: "viewport.update", x: value.x, y: value.y, zoom: value.zoom },
  };
}

/** Guard server payloads before the browser applies them. */
export function isServerPresenceMessage(
  value: unknown,
): value is ServerToClientPresenceMessage {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "presence.snapshot":
      return (
        Array.isArray(value.participants) &&
        value.participants.every(isPresenceParticipant)
      );
    case "presence.joined":
      return isRecord(value.participant) && isPresenceParticipant(value.participant);
    case "presence.left":
      return (
        typeof value.connectionId === "string" &&
        typeof value.userId === "string"
      );
    case "pointer.move":
      return (
        typeof value.connectionId === "string" &&
        typeof value.userId === "string" &&
        isValidSceneCoordinate(value.x) &&
        isValidSceneCoordinate(value.y)
      );
    case "viewport.update":
      return (
        typeof value.connectionId === "string" &&
        typeof value.userId === "string" &&
        isValidSceneCoordinate(value.x) &&
        isValidSceneCoordinate(value.y) &&
        isValidZoom(value.zoom)
      );
    case "error":
      return typeof value.message === "string";
    default:
      return false;
  }
}

function isPresenceParticipant(value: unknown): value is PresenceParticipant {
  if (!isRecord(value)) return false;
  if (
    typeof value.connectionId !== "string" ||
    typeof value.userId !== "string" ||
    typeof value.displayName !== "string" ||
    value.displayName.length === 0 ||
    value.displayName.length > 120
  ) {
    return false;
  }
  if (value.pointer !== undefined) {
    if (!isRecord(value.pointer)) return false;
    if (
      !isValidSceneCoordinate(value.pointer.x) ||
      !isValidSceneCoordinate(value.pointer.y)
    ) {
      return false;
    }
  }
  if (value.viewport !== undefined) {
    if (!isRecord(value.viewport)) return false;
    if (
      !isValidSceneCoordinate(value.viewport.x) ||
      !isValidSceneCoordinate(value.viewport.y) ||
      !isValidZoom(value.viewport.zoom)
    ) {
      return false;
    }
  }
  return true;
}

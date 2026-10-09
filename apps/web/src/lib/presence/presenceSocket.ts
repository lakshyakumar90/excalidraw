import {
  COLLAB_WS_PROTOCOL,
  PRESENCE_TICKET_PROTOCOL_PREFIX,
  PRESENCE_WS_PROTOCOL,
  isServerCollabMessage,
  isServerPresenceMessage,
  type ClientToServerCollabMessage,
  type ClientToServerPresenceMessage,
  type ServerToClientCollabMessage,
  type ServerToClientPresenceMessage,
} from "@repo/common";

/**
 * Room WebSocket connection (presence + element sync share one socket).
 *
 * Uses the browser's native WebSocket API. Authentication travels in
 * `Sec-WebSocket-Protocol` as `auth.<ticket>` next to the negotiated
 * protocol; a fresh ticket is fetched on every (re)connect, and tickets are
 * never persisted. Element traffic uses the collaboration protocol; the
 * durable outbox above this layer retries committed edits.
 */

export type RoomMessage = ClientToServerPresenceMessage | ClientToServerCollabMessage;

export type PresenceConnectionStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "offline";

export const PRESENCE_BASE_BACKOFF_MS = 500;
export const PRESENCE_MAX_BACKOFF_MS = 15_000;
export const PRESENCE_STABLE_RESET_MS = 10_000;

/** Close codes the server uses for handshake/auth failures. */
const AUTH_CLOSE_CODES = new Set([4401, 4403]);

/** Exponential backoff with a small jitter, capped. Pure and testable. */
export function computeBackoff(
  attempt: number,
  baseMs: number = PRESENCE_BASE_BACKOFF_MS,
  capMs: number = PRESENCE_MAX_BACKOFF_MS,
): number {
  const grown = baseMs * 2 ** Math.max(0, Math.min(attempt, 10));
  const capped = Math.min(grown, capMs);
  return capped + Math.random() * capped * 0.2;
}

/** 401/403/404 ticket failures must not be retried forever. */
export function isPermanentTicketError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const status = (error as { status?: unknown }).status;
  return status === 401 || status === 403 || status === 404;
}

export function authFailureMessage(error: unknown, fallback: string): string {
  const status =
    typeof error === "object" && error !== null
      ? (error as { status?: unknown }).status
      : undefined;
  if (status === 401 || status === 403 || status === 404) {
    return "Presence sign-in failed. Sign in again or ask for room access, then reopen the room.";
  }
  return fallback;
}

export interface PresenceSocketEvents {
  getTicket: () => Promise<string>;
  onMessage: (message: ServerToClientPresenceMessage) => void;
  onCollabMessage: (message: ServerToClientCollabMessage) => void;
  onStatus: (status: PresenceConnectionStatus, detail: string | null) => void;
}

export interface PresenceConnectionOptions {
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  stableResetMs?: number;
}

export class PresenceConnection {
  private ws: WebSocket | null = null;
  private intentionalClose = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly roomId: string,
    private readonly events: PresenceSocketEvents,
    private readonly options: PresenceConnectionOptions = {},
  ) {}

  start(): void {
    this.intentionalClose = false;
    this.attempt = 0;
    void this.open();
  }

  send(message: RoomMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /** True while the socket is open (queued work still needs the outbox). */
  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Which protocol the server negotiated for this socket, if any. */
  get protocol(): string {
    return this.ws?.protocol ?? "";
  }

  close(): void {
    this.intentionalClose = true;
    this.clearTimers();
    try {
      this.ws?.close(1000, "Presence channel closed");
    } catch {
      // Closing an already-closed socket is fine.
    }
    this.ws = null;
    this.events.onStatus("offline", null);
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.stableTimer !== null) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
  }

  private async open(): Promise<void> {
    if (this.intentionalClose) return;
    this.events.onStatus(
      this.attempt === 0 ? "connecting" : "reconnecting",
      null,
    );
    let ticket: string;
    try {
      ticket = await this.events.getTicket();
    } catch (error) {
      if (this.intentionalClose) return;
      if (isPermanentTicketError(error)) {
        this.events.onStatus("offline", authFailureMessage(error, ""));
        return;
      }
      this.scheduleReconnect();
      return;
    }
    if (this.intentionalClose) return;
    const ws = new WebSocket(
      `${this.baseUrl}/room/${encodeURIComponent(this.roomId)}`,
      [
        COLLAB_WS_PROTOCOL,
        PRESENCE_WS_PROTOCOL,
        `${PRESENCE_TICKET_PROTOCOL_PREFIX}${ticket}`,
      ],
    );
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws || this.intentionalClose) return;
      this.events.onStatus("live", null);
      // A stable connection resets the backoff for the next drop.
      const stableResetMs =
        this.options.stableResetMs ?? PRESENCE_STABLE_RESET_MS;
      this.stableTimer = setTimeout(() => {
        this.stableTimer = null;
        this.attempt = 0;
      }, stableResetMs);
    };
    ws.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed =
          typeof event.data === "string" ? JSON.parse(event.data) : undefined;
      } catch {
        return;
      }
      if (isServerPresenceMessage(parsed)) {
        this.events.onMessage(parsed);
        return;
      }
      if (isServerCollabMessage(parsed)) {
        this.events.onCollabMessage(parsed);
      }
    };
    ws.onclose = (event) => {
      if (this.ws === ws) this.ws = null;
      if (this.stableTimer !== null) {
        clearTimeout(this.stableTimer);
        this.stableTimer = null;
      }
      if (this.intentionalClose) return;
      if (AUTH_CLOSE_CODES.has(event.code)) {
        this.events.onStatus(
          "offline",
          event.code === 4403
            ? "Your access to this room was revoked, so presence is offline."
            : "Presence sign-in expired. Fetch a fresh ticket by reopening the room.",
        );
        return;
      }
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      // The following close event drives reconnect or failure handling.
    };
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;
    const delay = computeBackoff(
      this.attempt,
      this.options.baseBackoffMs ?? PRESENCE_BASE_BACKOFF_MS,
      this.options.maxBackoffMs ?? PRESENCE_MAX_BACKOFF_MS,
    );
    this.attempt += 1;
    this.events.onStatus("reconnecting", null);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open();
    }, delay);
  }
}

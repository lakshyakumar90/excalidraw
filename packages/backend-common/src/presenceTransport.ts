import { PRESENCE_TICKET_PROTOCOL_PREFIX } from "@repo/common";

/**
 * Backend-only transport helpers genuinely shared by the HTTP ticket issuer
 * and the WebSocket presence server. Auth-specific signing logic lives in
 * `packages/auth`; no database imports are allowed here.
 */

/** `ws` ping interval (~20s) and the expected pong deadline. */
export const WS_HEARTBEAT_INTERVAL_MS = 20_000;
/** Re-check room membership on this interval so revoked users lose access. */
export const WS_MEMBERSHIP_RECHECK_MS = 5_000;
/** Modest maximum WebSocket payload: presence frames are tiny JSON. */
export const WS_MAX_PAYLOAD_BYTES = 8 * 1024;
/** Sliding-window rate limit per connection (messages per window). */
export const WS_RATE_LIMIT_MAX_MESSAGES = 60;
export const WS_RATE_LIMIT_WINDOW_MS = 1_000;
/** Skip pointer fan-out to sockets buffering more than this. */
export const WS_SLOW_SOCKET_BUFFERED_BYTES = 64 * 1024;

/** Private-use close codes so browsers can distinguish auth failures. */
export const WS_CLOSE_AUTH_INVALID = 4401;
export const WS_CLOSE_FORBIDDEN = 4403;
export const WS_CLOSE_POLICY = 4408;
export const WS_CLOSE_MEMBERSHIP_REVOKED = 4403;

export function getAllowedWsOrigins(): string[] {
  const extra = (process.env.WS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const webOrigin = (process.env.WEB_ORIGIN ?? "").trim();
  const origins = new Set<string>(extra);
  if (webOrigin) origins.add(webOrigin);
  return [...origins];
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
): boolean {
  // Same-origin and non-browser clients omit Origin; allow those through and
  // rely on ticket + membership checks for authorization.
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true;
  return allowedOrigins.includes(origin);
}

/**
 * Extract the presence ticket from a `Sec-WebSocket-Protocol` header value.
 * The browser offers `[PRESENCE_WS_PROTOCOL, "auth.<ticket>"]`; only the
 * stable protocol is ever negotiated back.
 */
export function parseTicketFromProtocols(
  header: string | string[] | undefined,
): string | null {
  const values = Array.isArray(header)
    ? header.flatMap((entry) => entry.split(","))
    : (header ?? "").split(",");
  for (const value of values) {
    const protocol = value.trim();
    if (protocol.startsWith(PRESENCE_TICKET_PROTOCOL_PREFIX)) {
      const ticket = protocol.slice(PRESENCE_TICKET_PROTOCOL_PREFIX.length);
      if (ticket.length > 0) return ticket;
    }
  }
  return null;
}

/** Parse `/room/:roomId` upgrade paths; room ID is a routing hint only. */
export function parseRoomIdFromPath(pathname: string | null | undefined): number | null {
  if (!pathname) return null;
  const match = /^\/room\/(\d+)\/?$/.exec(pathname);
  if (!match?.[1]) return null;
  const roomId = Number(match[1]);
  return Number.isSafeInteger(roomId) && roomId > 0 ? roomId : null;
}

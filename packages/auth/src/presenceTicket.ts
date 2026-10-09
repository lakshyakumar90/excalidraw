import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

/**
 * Short-lived presence tickets (Phase 14).
 *
 * The browser fetches a ticket over authenticated HTTP and presents it once
 * during the WebSocket handshake in `Sec-WebSocket-Protocol`. Tickets prove
 * only the initial handshake: the WebSocket server re-checks room membership
 * at upgrade time and on a bounded interval afterwards.
 */

export const PRESENCE_TICKET_ISSUER = "excalidraw-presence";
export const PRESENCE_TICKET_AUDIENCE = "excalidraw-ws";
/** Tickets are valid for roughly 60 seconds, per the Phase 14 handoff. */
export const PRESENCE_TICKET_TTL_SECONDS = 60;

export interface PresenceTicketClaims {
  userId: string;
  roomId: number;
  ticketId: string;
}

interface PresenceTicketPayload {
  roomId: number;
}

export function getPresenceTicketSecret(): string {
  const secret = process.env.PRESENCE_TICKET_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Set PRESENCE_TICKET_SECRET to a random value of at least 32 characters.",
    );
  }
  return secret;
}

export function assertPresenceTicketConfiguration(): void {
  getPresenceTicketSecret();
}

export function issuePresenceTicket(input: {
  userId: string;
  roomId: number;
}): string {
  if (!input.userId || !Number.isSafeInteger(input.roomId) || input.roomId <= 0) {
    throw new Error("A valid user ID and room ID are required to issue a ticket.");
  }
  const secret = getPresenceTicketSecret();
  const payload: PresenceTicketPayload = { roomId: input.roomId };
  return jwt.sign(payload, secret, {
    subject: input.userId,
    issuer: PRESENCE_TICKET_ISSUER,
    audience: PRESENCE_TICKET_AUDIENCE,
    expiresIn: PRESENCE_TICKET_TTL_SECONDS,
    jwtid: randomUUID(),
  });
}

export function verifyPresenceTicket(token: string): PresenceTicketClaims {
  const secret = getPresenceTicketSecret();
  const decoded = jwt.verify(token, secret, {
    issuer: PRESENCE_TICKET_ISSUER,
    audience: PRESENCE_TICKET_AUDIENCE,
  });
  if (typeof decoded === "string" || !decoded || typeof decoded !== "object") {
    throw new Error("Invalid presence ticket.");
  }
  const userId = decoded.sub;
  const roomId = (decoded as { roomId?: unknown }).roomId;
  const ticketId = decoded.jti;
  if (
    typeof userId !== "string" ||
    userId.length === 0 ||
    !Number.isSafeInteger(roomId) ||
    (roomId as number) <= 0 ||
    typeof ticketId !== "string" ||
    ticketId.length === 0
  ) {
    throw new Error("Invalid presence ticket claims.");
  }
  return { userId, roomId: roomId as number, ticketId };
}

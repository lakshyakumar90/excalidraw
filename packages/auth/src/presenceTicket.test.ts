import { describe, expect, it, beforeEach, vi } from "vitest";
import jwt from "jsonwebtoken";
import {
  issuePresenceTicket,
  verifyPresenceTicket,
  getPresenceTicketSecret,
  PRESENCE_TICKET_AUDIENCE,
  PRESENCE_TICKET_ISSUER,
} from "./presenceTicket.js";

const SECRET = "test-presence-ticket-secret-at-least-32-chars";

beforeEach(() => {
  process.env.PRESENCE_TICKET_SECRET = SECRET;
});

describe("getPresenceTicketSecret", () => {
  it("fails startup when the secret is absent or weak", () => {
    delete process.env.PRESENCE_TICKET_SECRET;
    expect(() => getPresenceTicketSecret()).toThrow();
    process.env.PRESENCE_TICKET_SECRET = "too-short";
    expect(() => getPresenceTicketSecret()).toThrow();
  });
});

describe("presence tickets", () => {
  it("round-trips user and room claims with issuer/audience and a unique ticket id", () => {
    const token = issuePresenceTicket({ userId: "user-1", roomId: 42 });
    const claims = verifyPresenceTicket(token);
    expect(claims.userId).toBe("user-1");
    expect(claims.roomId).toBe(42);
    expect(claims.ticketId).toMatch(/^[0-9a-f-]{36}$/);

    const decoded = jwt.decode(token) as jwt.JwtPayload;
    expect(decoded.iss).toBe(PRESENCE_TICKET_ISSUER);
    expect(decoded.aud).toBe(PRESENCE_TICKET_AUDIENCE);
    expect(typeof decoded.exp).toBe("number");
    expect(typeof decoded.iat).toBe("number");
    // Roughly 60 seconds of validity.
    expect(decoded.exp! - decoded.iat!).toBeLessThanOrEqual(61);
    expect(decoded.exp! - decoded.iat!).toBeGreaterThanOrEqual(59);
  });

  it("issues unique ticket ids per call", () => {
    const first = verifyPresenceTicket(
      issuePresenceTicket({ userId: "user-1", roomId: 7 }),
    );
    const second = verifyPresenceTicket(
      issuePresenceTicket({ userId: "user-1", roomId: 7 }),
    );
    expect(first.ticketId).not.toBe(second.ticketId);
  });

  it("rejects tickets signed with a different secret", () => {
    const token = issuePresenceTicket({ userId: "user-1", roomId: 7 });
    process.env.PRESENCE_TICKET_SECRET =
      "a-completely-different-secret-at-least-32!!";
    expect(() => verifyPresenceTicket(token)).toThrow();
  });

  it("rejects expired tickets", () => {
    const expired = jwt.sign({ roomId: 7 }, SECRET, {
      subject: "user-1",
      issuer: PRESENCE_TICKET_ISSUER,
      audience: PRESENCE_TICKET_AUDIENCE,
      expiresIn: -10,
      jwtid: "expired-ticket",
    });
    expect(() => verifyPresenceTicket(expired)).toThrow();
  });

  it("rejects wrong-room and wrong issuer/audience tickets", () => {
    const wrongIssuer = jwt.sign({ roomId: 7 }, SECRET, {
      subject: "user-1",
      issuer: "someone-else",
      audience: PRESENCE_TICKET_AUDIENCE,
      expiresIn: 60,
      jwtid: "x",
    });
    expect(() => verifyPresenceTicket(wrongIssuer)).toThrow();

    const wrongAudience = jwt.sign({ roomId: 7 }, SECRET, {
      subject: "user-1",
      issuer: PRESENCE_TICKET_ISSUER,
      audience: "someone-else",
      expiresIn: 60,
      jwtid: "x",
    });
    expect(() => verifyPresenceTicket(wrongAudience)).toThrow();

    const missingRoom = jwt.sign({}, SECRET, {
      subject: "user-1",
      issuer: PRESENCE_TICKET_ISSUER,
      audience: PRESENCE_TICKET_AUDIENCE,
      expiresIn: 60,
      jwtid: "x",
    });
    expect(() => verifyPresenceTicket(missingRoom)).toThrow();
  });

  it("requires a valid user and room when issuing", () => {
    expect(() => issuePresenceTicket({ userId: "", roomId: 1 })).toThrow();
    expect(() => issuePresenceTicket({ userId: "u", roomId: 0 })).toThrow();
    expect(() => issuePresenceTicket({ userId: "u", roomId: -3 })).toThrow();
  });

  it("uses fake timers safely (documents short ttl, not wall-clock coupling)", () => {
    vi.useFakeTimers();
    try {
      const token = issuePresenceTicket({ userId: "user-1", roomId: 1 });
      expect(() => verifyPresenceTicket(token)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

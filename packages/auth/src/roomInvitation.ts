import { createHmac } from "node:crypto";
import jwt from "jsonwebtoken";

export const ROOM_INVITE_ISSUER = "excalidraw-room-invite";
export const ROOM_INVITE_AUDIENCE = "excalidraw-room-join";
export const ROOM_INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface RoomInviteClaims {
  inviteId: string;
  roomId: number;
  email: string;
  role: "editor" | "viewer";
  jti: string;
  exp: number;
}

function signingKey(): Buffer {
  const secret = process.env.ROOM_INVITE_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Room invitation signing requires a 32-character secret.");
  return createHmac("sha256", secret)
    .update("excalidraw:room-invitation:v1")
    .digest();
}

export function issueRoomInviteToken(input: {
  inviteId: string;
  roomId: number;
  email: string;
  role: "editor" | "viewer";
  expiresAt: string;
}): string {
  if (!input.inviteId || !Number.isSafeInteger(input.roomId) || input.roomId <= 0)
    throw new Error("A valid room invitation is required.");
  const expiresIn = Math.floor((Date.parse(input.expiresAt) - Date.now()) / 1000);
  if (expiresIn <= 0) throw new Error("The invitation expiry must be in the future.");
  return jwt.sign(
    {
      purpose: "room-invitation",
      roomId: input.roomId,
      email: input.email.trim().toLowerCase(),
      role: input.role,
    },
    signingKey(),
    {
      algorithm: "HS256",
      issuer: ROOM_INVITE_ISSUER,
      audience: ROOM_INVITE_AUDIENCE,
      expiresIn,
      jwtid: input.inviteId,
    },
  );
}

export function verifyRoomInviteToken(token: string): RoomInviteClaims {
  const decoded = jwt.verify(token, signingKey(), {
    algorithms: ["HS256"],
    issuer: ROOM_INVITE_ISSUER,
    audience: ROOM_INVITE_AUDIENCE,
  });
  if (!decoded || typeof decoded === "string" || decoded.purpose !== "room-invitation")
    throw new Error("Invalid room invitation.");
  const { jti, roomId, email, role, exp } = decoded;
  if (
    typeof jti !== "string" ||
    !jti ||
    !Number.isSafeInteger(roomId) ||
    (roomId as number) <= 0 ||
    typeof email !== "string" ||
    !email.includes("@") ||
    (role !== "editor" && role !== "viewer") ||
    typeof exp !== "number"
  ) throw new Error("Invalid room invitation claims.");
  return {
    inviteId: jti,
    roomId: roomId as number,
    email: email.toLowerCase(),
    role,
    jti,
    exp,
  };
}

export function isRoomInviteDeliveryConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendRoomInvitationEmail(input: {
  to: string;
  roomName: string;
  inviterName: string;
  role: "editor" | "viewer";
  expiresAt: string;
  url: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: `Invitation to ${input.roomName}`,
        text: `${input.inviterName} invited you to join ${input.roomName} as a ${input.role}.\n\nOpen this link to sign in and join:\n${input.url}\n\nThis invitation expires ${input.expiresAt}.`,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Accept only same-origin relative paths intended for an auth continuation. */
export function safeAuthReturnPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 2_048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) return "/dashboard";
  try {
    const decodedPath = decodeURIComponent(value);
    if (decodedPath.startsWith("//") || decodedPath.includes("\\"))
      return "/dashboard";
    const parsed = new URL(value, "https://app.invalid");
    if (parsed.origin !== "https://app.invalid") return "/dashboard";
    if (!parsed.pathname.startsWith("/invite/") && !parsed.pathname.startsWith("/join/"))
      return "/dashboard";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}

import "dotenv/config";
import type { IncomingHttpHeaders } from "node:http";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { username } from "better-auth/plugins";
import bcrypt from "bcrypt";
import { authPool } from "@repo/db";

export {
  assertPresenceTicketConfiguration,
  getPresenceTicketSecret,
  issuePresenceTicket,
  verifyPresenceTicket,
  PRESENCE_TICKET_AUDIENCE,
  PRESENCE_TICKET_ISSUER,
  PRESENCE_TICKET_TTL_SECONDS,
} from "./presenceTicket.js";
export type { PresenceTicketClaims } from "./presenceTicket.js";

export const authWebOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const port = process.env.PORT ?? "5000";
const apiOrigin = process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

async function sendVerificationEmail(to: string, url: string) {
  if (!resendApiKey || !emailFrom) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[auth] Email verification link for ${to}: ${url}`);
      return;
    }
    throw new Error(
      "Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.",
    );
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [to],
      subject: "Verify your Excalidraw email",
      text: `Verify your email address to finish creating your Excalidraw account:\n\n${url}\n\nThis link expires in one hour.`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Could not send verification email (${response.status}): ${detail}`,
    );
  }
}

export const auth = betterAuth({
  appName: "Excalidraw",
  baseURL: apiOrigin,
  secret: process.env.BETTER_AUTH_SECRET,
  database: authPool,
  trustedOrigins: [authWebOrigin, apiOrigin],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    password: {
      // Existing account hashes use bcrypt.
      hash: (password) => bcrypt.hash(password, 12),
      verify: ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    },
  },
  user: { fields: { image: "avatar" } },
  plugins: [username({ displayUsername: false })],
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path !== "/sign-up/email") return;
      const usernameValue = context.body?.username;
      if (
        typeof usernameValue !== "string" ||
        usernameValue.trim().length === 0
      ) {
        throw new APIError("BAD_REQUEST", {
          message: "A username is required to create an account.",
        });
      }
    }),
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            requireEmailVerification: true,
          },
        }
      : {},
});

export const authHandler = toNodeHandler(auth);

export function assertAuthConfiguration() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Set BETTER_AUTH_SECRET to a random value of at least 32 characters.",
    );
  }
}

export function getSessionFromHeaders(headers: IncomingHttpHeaders) {
  return auth.api.getSession({ headers: fromNodeHeaders(headers) });
}

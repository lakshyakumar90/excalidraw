import "dotenv/config";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import { sendVerificationEmail } from "./services/email.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be configured for the HTTP server.");
}

const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const port = process.env.PORT ?? "5000";
const apiOrigin = process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
export const authPool = new Pool({ connectionString: databaseUrl });

export const auth = betterAuth({
  appName: "Excalidraw",
  baseURL: apiOrigin,
  secret: process.env.BETTER_AUTH_SECRET,
  database: authPool,
  trustedOrigins: [webOrigin, apiOrigin],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    password: {
      // Preserve compatibility with bcrypt hashes created by the existing signup flow.
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
  user: {
    fields: {
      image: "avatar",
    },
  },
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

export const authWebOrigin = webOrigin;
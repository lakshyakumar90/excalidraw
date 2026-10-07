import "dotenv/config";
import { betterAuth } from "better-auth";
import { Pool } from "pg";
import bcrypt from "bcrypt";

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
    password: {
      // Preserve compatibility with bcrypt hashes created by the existing signup flow.
      hash: (password) => bcrypt.hash(password, 12),
      verify: ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  user: {
    fields: {
      image: "avatar",
    },
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {},
});

export const authWebOrigin = webOrigin;

import { createAuthClient } from "better-auth/react";

const authServerUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export const authClient = createAuthClient({
  baseURL: authServerUrl,
  fetchOptions: {
    credentials: "include",
  },
});

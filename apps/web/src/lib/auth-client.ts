import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

const authServerUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export const authClient: ReturnType<typeof createAuthClient> = createAuthClient(
  {
    baseURL: authServerUrl,
    plugins: [usernameClient({ displayUsername: false })],
    fetchOptions: {
      credentials: "include",
    },
  },
);

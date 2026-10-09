# Running the development servers

The HTTP and WebSocket apps run from different working directories. Put shared backend values in a repository-root `.env`, based on [`.env.example`](../.env.example). The database package reads a service-local `.env` first and then the root `.env`. A service-local value wins if both files define the same key. Do not commit real credentials.

Both services need the same `DATABASE_URL` and `PRESENCE_TICKET_SECRET`. The HTTP server also needs `BETTER_AUTH_SECRET` (at least 32 characters). Set `WEB_ORIGIN` to the browser origin. Web clients use `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` in `apps/web/.env.local` if their default localhost URLs are not suitable.

Run `pnpm dev` from the repository root. Turborepo builds the workspace packages needed by the apps before starting their watchers. The WebSocket server uses Prisma for membership checks and does not start Better Auth or its separate PostgreSQL pool. It should log `Presence server is running on port 8080` after the database connection succeeds.

To start only the WebSocket app, run `pnpm exec turbo run dev --filter=ws-server`; this also builds its package dependencies. If `DATABASE_URL must be configured` appears, check the root or `apps/ws-server/.env`. If the presence-ticket secret is missing, add the **same** `PRESENCE_TICKET_SECRET` to the environment used by both HTTP and WebSocket apps, then restart both.

The ticket is sent in the WebSocket subprotocol, not a URL query. The WebSocket server still checks room membership through `@repo/db` on each upgrade.

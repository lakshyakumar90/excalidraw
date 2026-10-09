# Phase 13 architecture decisions

**Status:** Accepted for Phase 13

## Backend boundaries

- Keep `apps/web` as the Next.js frontend only. Do not implement backend API
  endpoints as Next.js route handlers.
- Extend the existing Express server in `apps/http-server` for account,
  session, scene CRUD, room, membership, and invitation HTTP endpoints.
- Keep Better Auth configuration, email delivery, session validation, and the
  browser auth client in `packages/auth`. The HTTP server mounts its handler;
  `apps/web` calls the HTTP server and does not host auth or data API routes.
- Mount Better Auth's Express handler in `apps/http-server` before global body
  parsing middleware, following Better Auth's Express integration requirements.
  Keep browser requests credentialed and restrict CORS to the configured web
  origin.
- Use the existing `packages/db` Prisma/PostgreSQL package for application
  models and the checked-in migration graph.
- `packages/db/src/prisma/db.ts` owns the Prisma ORM 8 runtime used by
  application queries and the `pg.Pool` required by Better Auth's built-in
  PostgreSQL adapter. The contract query runtime is not the conventional
  `PrismaClient` expected by Better Auth's Prisma adapter. Both clients use
  the same `DATABASE_URL`; auth tables remain in the Prisma contract and its
  migration history. Apps do not initialize database clients.
- Use Google as the first OAuth provider. Keep it disabled until both Google
  credentials are present in the HTTP server environment.
- Keep database use provider-neutral: local Docker PostgreSQL and Neon
  PostgreSQL are both configured through environment variables. Choose the
  deployment target later without changing scene or ownership rules.
- Keep `apps/ws-server` as a separate real-time service for Phase 14. It must
  not be used as the HTTP API for authentication or scene CRUD.
- Use the existing `ws` library in `apps/ws-server` for Phase 14 real-time
  collaboration, with the browser's native `WebSocket` API in `apps/web`. Do
  not add Socket.IO. The `ws` server owns WebSocket upgrades and message
  fan-out; database room membership remains authoritative. Phase 14 must
  implement room fan-out, heartbeat, reconnect behavior, acknowledgements, and
  snapshot or version-based recovery explicitly. WebSocket delivery alone is
  not durable.
- Configure the frontend to call the HTTP server through an explicit API
  origin. Configure credentialed CORS and cookie/CSRF protections for the
  chosen deployment origins. In Phase 14, the WebSocket server validates a
  short-lived presence ticket during the upgrade; never put session tokens
  in WebSocket query strings.
- Derive the current user from the server-validated session. API callers must
  not be allowed to choose an `ownerId` for scene or room operations.

## Phase 14 presence authentication (supersedes the cookie-upgrade note)

**Status:** Accepted for Phase 14. This section supersedes the older Phase 13
guidance that the WebSocket server should validate the session cookie during
the upgrade.

- The browser calls `POST /room/:roomId/presence-ticket` with credentials.
  The HTTP server validates the Better Auth session through `packages/auth`
  and checks current room ownership/membership through `@repo/db`, then
  `packages/auth` signs a JWT valid for roughly 60 seconds with explicit
  issuer (`excalidraw-presence`), audience (`excalidraw-ws`), expiry,
  issued-at time, user ID (subject), room ID, and a unique ticket ID
  (`PRESENCE_TICKET_SECRET`, at least 32 characters, required at startup
  with no hard-coded fallback). Tickets live in browser memory only.
- The browser opens `/room/:roomId` over `ws`/`wss` with the native
  `WebSocket` API, offering `[excalidraw-presence.v1, auth.<ticket>]` in
  `Sec-WebSocket-Protocol`. The server negotiates only the stable protocol;
  the path room ID is a routing hint, not authorization.
- Before `handleUpgrade`, the WebSocket server verifies request `Origin`,
  ticket signature/issuer/audience/expiry/room scope, then re-checks room
  ownership/membership through `@repo/db`. Invalid upgrades get HTTP errors;
  the socket joins the in-memory room only afterwards. Membership is
  re-checked on a bounded interval so revoked users are closed promptly.
- This keeps the older rules intact — no session token or ticket in a URL
  query, no ticket logging — while meeting the Phase 14 requirement for a
  short-lived WebSocket JWT. The cookie session is used only at the HTTP
  issuance step.

## Scene privacy and persistence

- Phase 13 scenes are server-readable JSON data. End-to-end encryption is
  intentionally out of scope for this portfolio build.
- Store each drawing as one scene JSON document, including its elements,
  viewport/app state, and image file data required to restore it.
- Because the server can read this document, server-side recovery and future
  scene processing remain possible. Do not describe saved scenes as
  end-to-end encrypted.
- Reconsider this decision before adding any encryption. Encrypting scene data
  later requires a format and migration plan and removes the server's ability
  to read existing encrypted scenes without client-provided keys.

## Guest and signed-in routes

- `/` remains the account-free guest canvas and continues using IndexedDB.
- `/dashboard` is a Next.js frontend page that lists the signed-in user's saved scenes
  by calling `apps/http-server`.
- `/canvas/:id` is a Next.js frontend page that loads and saves only the requested
  server scene through `apps/http-server`.
- `/room/:roomId` is a Next.js frontend page that checks access through
  `apps/http-server` and loads its scene.
  Live synchronization and presence are Phase 14 work in `apps/ws-server`.
- Saving or migrating a guest drawing must not silently replace or erase the
  local IndexedDB drawing.

## Implementation consequences

1. Phase 13 must keep guest persistence separate from saved-scene persistence.
2. Every scene and room endpoint must enforce ownership or membership on the
   server, including reads, updates, and deletes.
3. Database schema and migrations must preserve the existing user, room,
   membership, and chat data while adding scenes and invitations.
4. Better Auth session cookies, rather than browser storage or URL query
   tokens, are the browser's authentication mechanism. The HTTP server owns
   session validation and authorization; the WebSocket server validates the
   same session before accepting a connection. WebSocket acknowledgements do
   not replace persisted scene state or version checks.

# Interview questions and answers

Speak the short response; use deep-dive notes for follow-up. Choices are retrospective unless there is a decision record.

## Project overview

**Tell me about the project.** **Simple:** It is a TypeScript collaborative drawing workspace. The browser has a custom canvas engine; guests store work locally, while signed-in users save scenes and collaborate in permissioned rooms. HTTP handles accounts and product APIs, WebSockets handle live edits/presence, PostgreSQL is durable storage, and Redis supports live coordination and queued snapshot writes. **Deep dive:** Web is `apps/web`; domain engine/protocol are `packages/engine` and `common`. HTTP, WS and worker are separate processes. Revisions persist through `SceneRevision`; presence is ephemeral. Historical ownership and original choice rationale are not established here.

**What was technically difficult?** Explain concurrent room commits, revision uniqueness, retry/replay, client outbox/reconciliation, and the Redis-to-Postgres recovery boundary. Do not claim exactly-once delivery.

## Architecture

**Why a monorepo?** **Simple:** pnpm workspace shares protocol, engine and infrastructure packages while allowing separate web/API/socket/worker processes. Cost is coordinated releases and dependency discipline. **Deep dive:** `pnpm-workspace.yaml` includes `apps/*` and `packages/*`; Turbo runs dependency-aware tasks. `common` is cross-platform, `backend-common` server-only, `db` centralizes database access. This is retrospective justification.

**What if one service fails?** HTTP startup checks DB/Redis and exits on initialization failure. WS auth/access and Redis features degrade; worker logs job failure and dirty-room recovery retries. Current health endpoint is process-only. Explain the actual failure case being asked and avoid claiming global resilience guarantees.

## Technology selection

**Why React/Next?** App Router handles page structure and React interactive components; canvas engine remains separate. Vite/router, Vue and Angular are alternatives. Next adds server/client boundary complexity.

**Why Express plus separate `ws`?** Express provides HTTP middleware/routes; long-lived WS connections have separate upgrade, heartbeat and room lifecycle. Native HTTP is lower-level; Fastify offers schema/throughput conventions; Socket.IO adds room/reconnect behaviors. Current protocol is validated by `common` and implemented by this app.

**Why Postgres, Prisma and Redis?** Postgres models relational ownership/access and unique claim/revision constraints. Prisma contract centralizes typed operations/migrations. Redis handles live state/pubsub/queue coordination. Prisma is not authorization and does not guarantee fast SQL; Redis/Postgres dual-store consistency needs care. Alternatives include raw SQL/Drizzle or database-only polling, depending on constraints.

**Why Better Auth?** Authentication contains security-sensitive session, cookie and recovery edge cases; a library reduces custom protocol code, while app retains room authorization and ticket policy. Trade-off: library/schema coupling. Alternatives include hosted auth/Auth.js/custom; no historical evaluation is asserted.

## Language and frontend

**Why TypeScript?** Shared contracts across browser/server reduce shape errors; it does not validate network JSON at runtime, so protocol validators matter. Async operations use the JS event loop; CPU-heavy canvas work can block the browser thread.

**How is editor state organized?** Engine scene/history/selection own editor behavior; React components/hooks bridge input, persistence and sync. Jotai exists for atom state, but not all local component state should be global. Profile rerenders before optimizing.

## Backend, database and security

**Trace a scene request.** Browser `lib/api/request.ts` sends a cookie-bearing request → Express CORS/auth/body routing → `requireAuth` session lookup → route ownership/validation → DB repository → JSON result. Missing session returns 401. References: `app.ts`, `middleware.ts`, `routes/scenes.ts`, `packages/db/src/prisma/sceneSync.ts`.

**Authentication versus authorization?** Session establishes identity; owner/room role checks determine access. Room roles are owner/editor/viewer and must be checked server-side.

**How is WS protected?** Ticket in subprotocol, origin/signature/room checks, membership/role validation before upgrade and periodic rechecks. Path is routing only. Message validators and rate budgets apply after connection.

**What if two users commit at once?** Server reconciliation advances revision; unique `(sceneId, revision)` makes competing durable revision insertion conflict atomically. Client outbox/replay handles acknowledgements and retries. Explain this implementation's limits rather than claiming CRDT/global serializability.

**Is ORM injection protection sufficient?** Parameterization lowers SQL injection risk; inputs still require validation and every object needs authorization.

## Tests and deployment

**How do you test?** Vitest for web/shared packages; `tsx --test` for HTTP/WS/worker/Redis. Colocated tests cover protocol, routes, geometry, persistence and helpers; integration may require DB/Redis. Do not claim tests pass unless run.

**How is it deployed?** Repo documents frontend and Docker backend/EC2 paths with external Postgres/Redis, plus DB migration workflow. Confirm live environment separately; documentation does not establish production topology.

## Scenario and senior follow-ups

- **100k users?** Measure WS memory/fanout, Redis and DB pools; scale WS with shared fanout/leases, proxy upgrades and room-size limits; benchmark hot rooms.
- **Redis down?** Startup/live coordination/queueing are affected; restore service and verify dirty snapshot recovery and RPO.
- **DB down?** Auth/access and durable commits fail; add dependency-aware readiness/timeouts and bounded errors.
- **Slow API?** Trace timings, SQL plans, payload sizes and external calls; instrument before caching.
- **Duplicate operation?** Check mutation IDs/replay ACK and DB uniqueness; test crashes/retries to prove idempotency.
- **Email provider unavailable?** Surface delivery errors; add retry/outbox if product guarantee requires it.
- **Add caching?** Measure repeated authorized reads, define invalidation and identity-aware keys, then instrument hit/miss.
- **Whiteboard:** Browser → HTTP/session and WS/ticket; both use Postgres/Redis; worker persists snapshots. Mark durable data versus ephemeral presence and retry boundaries.

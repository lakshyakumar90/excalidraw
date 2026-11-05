# Technology stack deep dive

Alternatives below are retrospective justifications, not claims about historical deliberations. Versions come from manifests; package presence alone is not proof of active runtime use.

| Technology | Where / purpose | Retrospective fit, alternatives and trade-offs |
|---|---|---|
| TypeScript / Node.js | Browser, shared packages, HTTP/WS/worker. Root TS 7.0.2; Node >=24. | Shared types help across protocol boundaries; runtime validation is still needed. JavaScript is simpler but lacks static checks; Deno/Bun are options but ecosystem compatibility differs. |
| pnpm workspaces | `pnpm-workspace.yaml`, root `pnpm@11.25.0` | Links apps/packages and one lockfile; npm/yarn workspaces are alternatives. Strict dependency layout helps expose undeclared imports. Nested web manifest declares pnpm 10.27.0 and should be reconciled. |
| Turborepo | Root scripts and `turbo.json` | Runs dependency-aware build/dev/lint/typecheck tasks and caches outputs. Plain scripts are enough for smaller repos; Nx offers richer graph tooling with more configuration. Cache correctness depends on declared inputs/env. |
| Next.js / React | `apps/web`; Next 16.3.5, React 19.2.8 | App Router plus React components serve editor/account/room flows; custom engine handles canvas. Vite/router, Vue or Angular are viable. Next adds server/client boundary complexity. |
| Express | HTTP server; Express 5.2.1 | Middleware and route groups in `app.ts`; native `node:http` is lower-level, Fastify emphasizes schemas/throughput, Nest adds DI/conventions. Express leaves domain organization to this repo. |
| `ws` | `apps/ws-server`; `^8.21.3` | WebSocket framing/upgrades. Socket.IO adds rooms/reconnect/fallback; SSE is one-way; custom protocol gives control but app owns validation, auth, heartbeat, broadcast and reconnect semantics. |
| PostgreSQL / `pg` | Durable DB; pg 8.23.1; docs require PostgreSQL 15+ | Relational ownership, unique access/claim/revision constraints and JSONB scene payloads. SQLite/MySQL/document DB are alternatives with different scaling/transaction/query trade-offs. |
| Prisma ORM 8 RC | `packages/db`; prisma 8.0.0-rc.14 and Postgres runtime RC.11 | Typed contract operations and migration workflow. Drizzle/SQL/Knex offer control alternatives. RC dependency has stability/migration risk; ORM does not authorize or guarantee efficient SQL. |
| Better Auth | `packages/auth`; 1.7.7 | Session/auth routes and PostgreSQL persistence. Hosted auth/Auth.js/custom are alternatives; custom auth has substantial security burden, while framework config/schema adds coupling. |
| bcrypt / jsonwebtoken | Declared in auth package; source includes signed ticket/invitation helpers; bcrypt may support auth password handling. | Established libraries avoid custom cryptography. Use exact callsites/config to explain roles; a JWT room ticket is not the same as the browser login session. Key rotation and claims checks remain app responsibilities. |
| Redis / ioredis / BullMQ | `packages/redis`; ioredis 6.0.0, BullMQ 6.3.12 | Live room state, pub/sub, leases, limits and queued snapshot flushes. DB polling/custom queue are alternatives; Redis introduces a second operational system and cross-store consistency work. |
| Zod | HTTP dependency 4.6.4 and validations package | Runtime input validation. JSON Schema/Ajv or hand-written guards are alternatives; schemas must still be complete and bounded. |
| Jotai | Web dependency 3.0.1 | Atom-oriented UI state. React state/context, Redux or Zustand are alternatives; only use where shared subscriptions justify it. |
| CSS tooling | Tailwind 4/PostCSS dependency; app contains authored CSS | Utility CSS may help composition, but source also uses `globals.css` and authored styles. CSS modules/plain CSS are alternatives. Do not imply all styling is Tailwind. |
| Tests and quality | Vitest 5; `tsx --test`; ESLint/Prettier | Colocated unit/route tests; split runners fit different package conventions but require distinct commands. Tests were not run in this task. |
| Email/OAuth | Resend helpers; optional Google provider | Optional verification/invite mail and OAuth. SMTP/other providers or password-only are alternatives; provider delivery and callback configuration remain operational concerns. |
| Deployment | Vercel, Docker/EC2/Caddy and Neon appear in docs/config | These are documented paths/options, not proof of current live deployment. Container-only or another cloud can reduce/increase operational coupling. |

## Library boundary: buy versus build

| Area | Current | From scratch would require | Recommendation |
|---|---|---|---|
| HTTP | Express | Parser, router, middleware order, CORS, errors and lifecycle | Keep unless measured throughput/schema needs favor Fastify. |
| Authentication | Better Auth | Password lifecycle, secure cookies, sessions, recovery, verification, OAuth, invalidation | Keep a maintained auth library; retain explicit app authorization. |
| Data access | Prisma contract + pg | Query construction, mapping, migrations, pools, transactions | Keep central `db` boundary; use explicit SQL only where needed and measured. |
| Validation | Zod + protocol validators | Malformed input handling, bounds, compatibility/versioning | Keep runtime checks at trust boundaries. |
| Realtime | `ws` + custom protocol | Upgrade, heartbeat, auth, ordering, fanout, rate control, backpressure | Keep if custom semantics are needed; consider Socket.IO only for concrete feature needs. |
| Queue | BullMQ/Redis | Atomic enqueue/claim, retry/recovery and concurrency management | Keep and monitor; consider transactional outbox if cross-store guarantee requires it. |
| Drawing engine | Internal `@repo/engine` | Geometry, hit testing, pressure, renderer, selection, history, tools | Product-specific code is justified only with comprehensive tests/maintenance. |
| Workspace | pnpm/Turbo | Linking and task graph/cache | Keep while shared code/release cadence matters; validate cache inputs. |

These libraries hide implementation edge cases, not application duties: authorization, validation, payload limits, secret rotation, query efficiency, retries, monitoring and protocol compatibility remain in scope.

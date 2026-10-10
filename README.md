# Collaborative drawing workspace

A TypeScript drawing application with guest storage, authenticated scenes, real-time rooms, a hand-drawn renderer, Redis write-behind persistence, and the Phase 19 editor features.

## Requirements

Node.js 24+, pnpm 11.25.0, PostgreSQL 15+, and Redis. Email delivery is needed for verification and invites; Google OAuth is optional.

## Setup

1. Run `pnpm install` at the repository root.
2. Copy `.env.example` to `.env`. Configure PostgreSQL, Redis, web origin, HTTP URL, and independent random authentication/presence secrets of at least 32 characters. Service-local environment files override shared settings.
3. Copy `apps/web/.env.example` to `apps/web/.env.local`, and configure public API/WebSocket URLs. Public variables must never contain secrets.
4. Start PostgreSQL and Redis. Use an existing local Redis or `docker compose up -d redis`.
5. From `packages/db`, run `pnpm db:emit`, `pnpm db:migration-check`, and `pnpm db:migrate` for a fresh database. For an existing database, verify migration/schema state before applying changes; do not blindly sign or reset it.
6. Run `pnpm dev` at the root. Turbo starts the web app, HTTP server, WebSocket server, and snapshot flush worker with their build dependencies.

Default URLs: [editor](http://localhost:3000/), [dashboard/sign-in](http://localhost:3000/dashboard), HTTP at port 5000, and WebSocket at port 8080. Redis defaults to port 6379. See environment examples for email and OAuth settings.

## Architecture

| Workspace                                           | Ownership                                                   |
| --------------------------------------------------- | ----------------------------------------------------------- |
| [web](apps/web/README.md)                           | Editor, account/room pages, IndexedDB, collaboration client |
| [HTTP server](apps/http-server/README.md)           | Authenticated scene, room, invite, file, and library APIs   |
| [WebSocket server](apps/ws-server/README.md)        | Authenticated room messages and presence                    |
| [flush worker](apps/flush-worker/README.md)         | BullMQ durable room snapshot flushes                        |
| [common](packages/common/README.md)                 | Cross-platform types, protocols, validation, reconciliation |
| [engine](packages/engine/README.md)                 | Geometry, tools, rendering, scene capture, history          |
| [backend-common](packages/backend-common/README.md) | Backend-only shared collaboration/access operations         |
| [db](packages/db/README.md)                         | Sole Prisma schema/client/repositories/migration graph      |
| [auth](packages/auth/README.md)                     | Authentication client/server and email integration          |
| [redis](packages/redis/README.md)                   | Live state, pub/sub, queue and rate limiting                |

Each maintained source folder has a README listing files and child folders. Generated output, dependencies, migration snapshots, and build caches are excluded.

## Data and editor behavior

Guest drawings/stamps stay on the device; account scenes/stamps are private authenticated records. Room commits reconcile deterministically per element, update Redis, and flush through Prisma to versioned durable snapshots. Presence, previews, selections, viewport updates, and laser trails are ephemeral. Servers enforce owner/editor/viewer permissions.

Frames are flat and axis-aligned. Library insertion remaps element identities and carries image data. Compact screens open tools/styles on demand; panels scroll within bounded space. The canvas fills its dynamic viewport, while account and room pages retain document scrolling.

## Development checks

```sh
pnpm check-types
pnpm --filter web test
pnpm --filter @repo/common test
pnpm --filter @repo/engine test
pnpm --filter web build
```

Use the service package scripts for focused server checks. Run relevant tests once, then resolve concrete failures. Browser checks should cover phone portrait/landscape, tablet, 1024px, and desktop. Physical touch/pen and screen-reader behavior require real-device verification.

## Contributing

Keep commits small and coherent. Put cross-platform reuse in common, server-only reuse in backend-common, authentication in auth, and durable database operations in db. Do not initialize a database inside a server app, commit environment credentials, edit generated output, or change a protocol without its validators/tests.

[Phase records](docs/README.md) document implementation and testing scope. [Phase 19 summary](docs/phase-19-implementation-summary.md) includes manual verification limits. Phase branches are retained after integration for inspectable history.

The current UI direction is documented in [DESIGN.md](DESIGN.md); the responsive consistency implementation plan is in [docs/ui-consistency-implementation-plan.md](docs/ui-consistency-implementation-plan.md).

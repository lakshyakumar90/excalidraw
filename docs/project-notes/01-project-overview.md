# Project overview

## Product

This is a TypeScript collaborative drawing workspace. The browser editor provides a custom hand-drawn canvas and local guest persistence. Signed-in users can save private scenes and libraries; rooms support role-based collaboration with transient presence and durable scene revisions. Product behavior described here is evidenced in source. Historical reasons for most choices are not documented.

## Features and evidence

| Feature | Entry points |
|---|---|
| Canvas drawing/editing | `apps/web/src/components/canvas/Canvas.tsx`, `CanvasWorkspace.tsx`, `hooks/canvas/useCanvasInteraction.ts`; `packages/engine/src/{tools,geometry,renderer}` |
| Guest/local scenes | `apps/web/src/lib/persistence/{indexedDb,autosave,savedScene}.ts` |
| Accounts/recovery | Pages in `apps/web/src/app/{signup,login,forgot-password,reset-password}`; `packages/auth/src/server.ts` |
| Private scenes | `apps/http-server/src/routes/scenes.ts`; `packages/db/src/prisma/sceneSync.ts` |
| Rooms and roles | `apps/http-server/src/routes/rooms.ts`; `RoomMember` / `RoomRole` in `packages/db/src/prisma/contract.prisma` |
| Live edits/presence | `apps/ws-server/src/server.ts`; `packages/common/src/{collabProtocol,presence}.ts`; web sync hooks |
| Durable room writes | `packages/redis/src/index.ts`; consumer in `apps/flush-worker/src/index.ts` |
| Personal library/import/export | `routes/library.ts`, web `PersonalLibraryPanel.tsx` and persistence modules |

## Stack

TypeScript, Node.js; Next.js 16 / React 19; Express 5; `ws`; PostgreSQL with Prisma ORM 8 release-candidate contract/runtime and `pg`; Redis with ioredis and BullMQ; Better Auth; Zod; Jotai; Vitest and Node test runner via tsx; pnpm workspaces and Turborepo. Root requires Node >=24 and pnpm 11.25.0. `apps/web/package.json` says pnpm 10.27.0, a conflicting nested declaration.

## Architecture summary

The pnpm/Turborepo monorepo contains a Next frontend and separate HTTP, WebSocket and flush-worker processes. PostgreSQL is durable storage for accounts, scenes, access and revision history. Redis supports room live state, pub/sub, leases/rate limits and queue coordination. Accepted edits are committed and eventually persisted as revisions; pointer, viewport, selection, preview and laser traffic is ephemeral.

``mermaid
flowchart LR
 U[Browser users] --> WEB[Next.js web app]
 WEB -->|HTTP JSON + cookies| API[Express HTTP API]
 WEB -->|ticketed WebSocket| WS[ws collaboration service]
 API --> AUTH[Better Auth]
 API --> PG[(PostgreSQL)]
 WS --> PG
 API --> REDIS[(Redis live state, pub/sub, queue)]
 WS --> REDIS
 WORKER[Snapshot flush worker / BullMQ] --> REDIS
 WORKER --> PG
``

Diagrams: [system](diagrams/system-architecture.mmd), [repository](diagrams/repository-architecture.mmd), [frontend](diagrams/frontend-architecture.mmd), [backend](diagrams/backend-architecture.mmd).

## Package boundaries

- `common`: browser/server types, validation, protocols and reconciliation.
- `engine`: editor geometry, tools, renderer, scene/history.
- `backend-common`: server-only collaboration/access operations.
- `db`: sole database clients, schema contract and repositories.
- `auth`: Better Auth, email and signed room/presence credential helpers.
- `redis`: shared live-room and queue operations.
- Apps compose packages and own process/runtime concerns.

These are defensible retrospective boundaries, not verified original ADR decisions.

## Recommended reading

[Architecture](03-architecture-and-design-decisions.md) → [stack](02-tech-stack-deep-dive.md) → [features](05-feature-and-code-walkthroughs.md) → [database](06-database-and-data-models.md) → [security](07-authentication-and-security.md) → [development](10-development-and-deployment-guide.md) → [interview guide](11-interview-questions-and-answers.md) → [coverage](16-coverage-and-validation.md).


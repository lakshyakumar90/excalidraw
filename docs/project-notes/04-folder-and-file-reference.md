# Folder and file reference

## Root

`package.json` defines root scripts, Node engine and pnpm version; `pnpm-workspace.yaml` lists `apps/*`/`packages/*`; `pnpm-lock.yaml` resolves dependencies; `turbo.json` defines tasks, env inputs and outputs. `.env.example` files document variable names. `.npmrc`, ignore files, `Dockerfile`, compose files and `.github/workflows/database-migrations.yml` configure package, build, deployment and migration behavior. `DESIGN.md` describes UI direction. `deploy/ec2` holds bootstrap and Caddy config. Existing `docs/*.md` contain phase/deployment notes.

## Applications

| Area | Responsibility / important files |
|---|---|
| `apps/web/src/app` | Next App Router home/editor, scene canvas, dashboard/auth, room, invite/join, dev benchmark. `layout.tsx` and CSS establish shell/styles. |
| `apps/web/src/components/canvas` | `Canvas.tsx`, `CanvasWorkspace.tsx`, controls, menus, help, benchmark and personal library. |
| `apps/web/src/components/presence` | Cursors, previews, selections, avatars, laser, presence/sync status. |
| `apps/web/src/components/{dashboard,account,rooms,editor,styles,toolbar,scene}` | Presentation for account, dashboards, rooms, editor controls, style/tool and scene utilities. |
| `apps/web/src/hooks` | Canvas interaction/persistence, dashboard auth/scenes/import/actions, realtime `useRoomSync.ts`. |
| `apps/web/src/lib/api` | `request.ts` transport plus auth/rooms/scenes clients. |
| `apps/web/src/lib/persistence` | IndexedDB, autosave, local drafts, import/export, images, library and SVG/raster output. |
| `apps/web/src/lib/sync` | Commit/outbox/reconciliation/preview/file sync. Other lib dirs own selection, scene, history, styles, tools, canvas and presence logic. |
| `apps/web/{next.config.ts,vitest.config.ts,eslint.config.mjs,postcss.config.mjs,tsconfig.json}` | App build/routing, test, lint, CSS, type config. |
| `apps/http-server/src/{index.ts,app.ts,middleware.ts}` | Service startup, Express setup, session gate. `routes/*.ts` implement scene, room, library, ticket/invite/join/leave/import handlers and tests. |
| `apps/ws-server/src/{index.ts,server.ts,roomStore.ts}` | WS process startup, upgrade/message lifecycle, local room/connection state and tests. |
| `apps/flush-worker/src/{index.ts,maintenance.ts}` | BullMQ consumer, dirty-room recovery scan and optional Redis metrics. |

## Packages

| Package | Responsibilities |
|---|---|
| `packages/common/src` | Cross-platform types, element/protocol validation, sync/reconciliation, presence, library and snapshot chunks. |
| `packages/engine/src` | Tools, geometry/hit testing, renderer/culling/cache, scene/history, viewport and text measurement. Unit tests are colocated. |
| `packages/auth/src` | Better Auth server/client, email, room invitation and presence-ticket signing/verification. |
| `packages/backend-common/src` | Server-only collaboration/access/presence transport and integration tests. |
| `packages/db/src/prisma` | Contract schema, generated contract, `db.ts`, library/access/scene repositories. `migrations/app` and `prisma.config.ts` define migration graph. |
| `packages/redis/src/index.ts` | Redis client, live room state/leases/pub-sub/rate limiting and BullMQ queue/worker integration. |
| `packages/validations/src/types.ts` | Shared validation types/schemas. |
| `packages/ui/src` | Button/card/code React components; not declared by web package dependencies. |
| `packages/{eslint-config,typescript-config}` | Shared lint and compiler presets. |

Per-directory README files list deeper contents. The complete tracked source/config list is in [file catalog](04-file-catalog.md). Generated output, `node_modules`, `.next`, `.turbo`, `dist`, caches, public binary assets, Prisma snapshots and vendored tool guidance are excluded. `apps/http-server/output.log` is tracked diagnostic output, not a runtime module; assess whether it belongs in source control.

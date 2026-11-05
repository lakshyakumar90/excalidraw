# Feature and code walkthroughs

## Canvas editing

The home/editor route enters at `apps/web/src/app/page.tsx`; room and saved-scene pages are separate routes. `CanvasWorkspace` composes surface, toolbar/styles and overlays. `Canvas` binds input/rendering; `useCanvasInteraction` maps pointer/keyboard events into engine tools. `packages/engine/src/tools` dispatches tools; geometry handles bounds, hit testing, curves, pressure strokes and transforms; renderer culls/draws elements. Scene/history/selection modules handle commits, undo/redo and transformations. Guest persistence uses IndexedDB and import/export helpers under `apps/web/src/lib/persistence`. Guests therefore depend on the device unless they export/import.

## Authentication and scenes

Sign-up/sign-in/recovery pages use dashboard/auth components and `packages/auth/src/client.ts`. Express mounts Better Auth at `/api/auth` before JSON parsing. `packages/auth/src/server.ts` configures session storage and optional provider/email integrations. `requireAuth` calls `getSessionFromHeaders`, attaches `req.userId`, then protected scene/library/room routes run. Scene UI calls API helpers and dashboard hooks; `routes/scenes.ts` calls DB repository code under `packages/db/src/prisma/sceneSync.ts`. Owner and role scoping must be enforced server-side; client-supplied identifiers do not grant access.

## Rooms, invites and live collaboration

Room pages/components and `hooks/sync/useRoomSync.ts` start the client flow. HTTP room routes create/list/manage access and invitations. Roles are `owner`, `editor`, `viewer`. Invite/join secrets are hashed, expiry/revocation checked; unique claim records and transactions serialize claim races. The browser obtains a short-lived ticket, places it in WS subprotocol (not query string), then `apps/ws-server/src/server.ts` validates origin, signature, room, membership and role before upgrade. `packages/common` validates messages. The server sends a participant snapshot and routes transient pointer/viewport/preview/selection/laser events; edits are role-gated, rate-limited, acknowledged and broadcast. Periodic rechecks enforce revocation/downgrade.

## Durable collaboration

`Scene.syncRevision` and unique `(sceneId, revision)` form the durable revision head. The server accepts reconciled commits and updates Redis live state/dirty marker, scheduling BullMQ flush work. `apps/flush-worker/src/index.ts` compares the DB head, inserts missing snapshots and retains a bounded number; startup and 60-second dirty-room scans recover queue gaps. This is recovery-oriented, at-least-once work, not exactly-once across Redis/Postgres. Client `outbox.ts`, `commits.ts`, `reconciliation.ts`, `roomSync.ts`, `syncBridge.ts` and shared `common/src/sync.ts` coordinate pending operations and remote winners; this is not a CRDT claim.

## Library and files

`PersonalLibraryPanel.tsx` calls authenticated library endpoints; `routes/library.ts`, `packages/db/src/prisma/library.ts`, and `LibraryItem` persist JSON data. Persistence helpers support images, imports, guest transfer, SVG/raster export and room file sync. The 50 MB JSON parser ceiling makes payload validation and resource limits material.

See [API/realtime diagrams](08-api-and-realtime-workflows.md). Tests are cataloged in [testing](09-testing-and-code-quality.md); they were not run for this documentation work.

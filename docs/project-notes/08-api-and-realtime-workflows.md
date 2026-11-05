# API and realtime workflows

## HTTP

`apps/http-server/src/app.ts` installs credentialed CORS, Better Auth `/api/auth`, 50 MB JSON parsing, `/health`, `/me`, then authenticated `/scenes`, `/library` and `/room`. Startup in `src/index.ts` asserts auth configuration and connects PostgreSQL/Redis before listening on `PORT` (default 5000). `requireAuth` returns 401 without session and 500 on session verification failure. Browser `apps/web/src/lib/api/request.ts` selects API origin/prefix; auth/rooms/scenes helpers live beside it.

The sequence is in [API request lifecycle](diagrams/api-request-lifecycle.mmd). Routes validate payloads/ownership and call package repositories. Do not infer undocumented HTTP paths/methods from UI names; inspect route modules/tests for exact contracts.

## WebSocket collaboration

Browser `useRoomSync.ts` plus `lib/presence` requests a ticket over authenticated HTTP and sends it in the subprotocol during upgrade. Server checks origin, ticket signature, ticket room binding, membership and role. The URL path is only a routing hint. After a presence snapshot, the server validates messages with `packages/common/src/{collabProtocol,collabValidation,presence,syncValidate}.ts`.

Committed element messages are access-checked, reconciled, acknowledged with revision/saved state and broadcast to peers. Pointer, viewport, previews, selection and laser updates are ephemeral and rate-limited. Heartbeats reap dead connections; Redis leases renew; membership and roles are periodically rechecked. See [realtime flow](diagrams/realtime-workflow.mmd) and [room workflow](diagrams/feature-workflows/room-collaboration.mmd).

`apps/web/src/lib/sync/{outbox,commits,reconciliation,roomSync,syncBridge}.ts` coordinate pending local work and remote acknowledgements. `packages/common/src/sync.ts` contains shared reconciliation. It is not a CRDT claim. Redis queues snapshot flush to the worker; uniqueness/retries/recovery do not establish exactly-once behavior.

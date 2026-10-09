# Phase 15 agent handoff: syncing elements

Implement this phase end to end, verify it with automated tests and two browsers, and push small, coherent commits to GitHub. This is a task specification, not a claim that Phase 15 is already implemented. Paths reflect the repository inspected on 2026-10-09; inspect current code before editing. Read applicable `AGENTS.md` files, including `apps/web/AGENTS.md` and the relevant installed Next.js guides when changing frontend code.

## Outcome and scope

Two authorized room participants see committed element changes and smooth in-progress drags. Each element reconciles by the higher `version`, then the higher `versionNonce`. New joins and stale reconnects merge the remote room scene with the correct local room draft. Deletion uses `isDeleted`, old deleted payloads are pruned safely, and remote selections appear as faint outlines. Changes survive a server restart once acknowledged as saved.

Keep Phase 14 cursors, avatars, origin checks, ticket authentication, membership checks, heartbeat, and reconnect behavior working. Phase 15 now permits explicitly typed element messages on that channel; update the old presence-only restrictions and names where necessary. Do not start Phase 16, add CRDTs, chat, distributed infrastructure, or replace the existing engine. Follow the higher-nonce rule supplied by the user even if another implementation uses a different tie-break.

## Package ownership

| Location | Responsibility |
| --- | --- |
| `packages/common` | Browser-safe element and collaboration types, runtime wire validation, limits, pure reconciliation and deterministic ordering helpers used by clients and servers. No Node, auth, or database imports. |
| `packages/backend-common` | Collaboration orchestration genuinely shared by HTTP and WS: authorization policy, merge/save workflow, conflict retries and backend transport helpers. Keep database queries in `packages/db` and auth logic in `packages/auth`. |
| `packages/db` | Existing Prisma client, PostgreSQL configuration, schema/migrations and transactional scene/room/member queries. All database initialization remains here. |
| `packages/auth` | Better Auth and room-scoped ticket issuance/verification. WS uses the lightweight `@repo/auth/presence-ticket` entry. |
| `packages/engine` | Scene commit notifications, applying remote elements without version bumps, local interaction lifecycle, history, renderer integration. |
| `apps/http-server` | Authorized scene reads and merge-based persistence endpoints that call shared backend services. |
| `apps/ws-server` | Authenticated room transport, initial sync, committed delta acceptance/acknowledgement, fan-out, ephemeral previews and selection. |
| `apps/web` | Room-scoped local drafts/outbox, one shared room connection, reconciliation integration, previews, remote selection UI and save/sync status. |

Use `@repo/db` and its existing Prisma ORM 8 API. Do not create another database client, pool, SQLite file or app-level database initialization. Do not introduce raw SQL for application queries. Inspect the installed Prisma API before choosing transactions, conditional updates and migrations; do not assume older Prisma Client methods exist. Use the repository's Prisma scripts for required schema changes and regenerate the contract/types. Preserve the shared root `.env` fallback and service-local overrides; never commit credentials.

## Current code to inspect first

- Shared model: `packages/common/src/element/types.ts`. Version, nonce, deletion and update time are currently optional; choose and document deterministic legacy normalization.
- Protocol: `packages/common/src/presence.ts`; both client and server validators currently reject element messages.
- Engine: `packages/engine/src/scene/scene.ts`, `history.ts`, tool implementations and `apps/web/src/components/canvas/Canvas.tsx`. `mutateElement` currently increments version on every call. History captures field deltas; these are not complete elements suitable for the wire. Z-order currently depends on array position.
- Persistence: `apps/web/src/lib/persistence/autosave.ts`, `indexedDb.ts`, `savedScene.ts`, `imageFiles.ts`, and `CanvasWorkspace`. IndexedDB currently has a singleton `current` scene; avoid merging it into arbitrary rooms.
- Room page: `apps/web/src/app/room/[roomId]/canvas/page.tsx`. It loads an HTTP scene and mounts presence separately; connect both to the same room scene instance and transport.
- Client transport: `apps/web/src/hooks/presence/usePresence.ts`, `lib/presence/presenceSocket.ts`, publisher and throttle utilities. `send` currently drops messages while disconnected; committed mutations need a durable outbox.
- Server: `apps/ws-server/src/index.ts`, `server.ts`, `roomStore.ts`; current 8 KiB payload limit and 60 messages/second budget were designed for presence.
- HTTP: `apps/http-server/src/routes/rooms.ts` and `scenes.ts`. Room PATCH currently replaces scene JSON wholesale. Generic owner scene PATCH can reach the same scene; every writer to a room-backed scene must use safe merge semantics.
- Startup and testing: `docs/development-servers.md`, workspace package scripts and `turbo.json`. Preserve compiled-package caching and build prerequisites.

Before implementation, record the chosen persistence authority, commit boundary, ordering representation, tombstone policy, limits and protocol version in `docs/architecture/phase-15-decisions.md`. Resolve these within the authorized task using current code; avoid leaving competing persistence paths.

## 1. Pure reconciliation and stable element identity

Put `reconcileElements` in `packages/common` so the browser and both servers call identical logic. Keep it pure, linear in element count using a map, and independent of the DOM, scene instance or clock.

For each incoming element ID: missing local means accept remote; higher version wins; equal version means higher nonce wins; equal version and nonce means no change. Normalize legacy missing metadata deterministically, for example `version = 1`, `versionNonce = 0`, `isDeleted = false`, `updated = 0`. Do not generate random nonces or timestamps while loading/reconciling. New locally created elements receive complete metadata once. Require finite safe integer version/nonce values and bounded IDs; reject invalid network elements before reconciliation.

The same `(id, version, nonce)` must identify the same committed content. Replays must be idempotent. If conflicting content with exactly equal metadata is possible, choose a deterministic canonical-content fallback or reject the invalid commit consistently at the authority; do not claim convergence while silently retaining different bodies. Do not use arrival time, participant identity or `updated` as a substitute for the requested version/nonce precedence. Deletion is an ordinary versioned element: it does not automatically win against a higher-version edit.

Send complete records only for changed IDs, including full text/points/bindings and tombstones, rather than field patches or the entire scene. Clone records before asynchronous sending so subsequent local mutations cannot change an already queued commit. Preserve unchanged object references where practical.

Array order also needs deterministic treatment. Add a stable per-element order key, or an equivalent explicit shared ordering protocol, for creation and z-order operations. A practical choice is a fractional order key with element ID as the final tie-break. Normalize legacy array ordering deterministically using the authoritative initial scene, preserve it in IndexedDB and server saves, and version-bump reordered elements. Test concurrent creation and bring-to-front/send-to-back. Sorting everything by ID alone would change drawing semantics.

## 2. Commit-aware scene events and interaction previews

Add explicit scene change metadata or a commit subscription carrying origin (`local`, `remote`, `preview`, `undo`, `redo`) and changed IDs. Do not broadcast from an undifferentiated scene subscriber or every pointermove. Cover drawing completion, movement, resize/rotation, text commit, styles, paste/duplicate/import, deletion, bindings, grouping, z-order, undo and redo. Include dependent elements changed by an action, such as bound arrows or container text.

Local pointer movement must update only an interaction preview until the gesture commits. At pointerup, create a committed record with one higher version and a fresh nonce per changed element. Keep preview geometry separately from the canonical committed scene, or provide an equally safe engine preview layer. Preview frames must not bump durable versions or enter IndexedDB, HTTP saves, the committed outbox or undo history. Audit existing tools because they currently call `mutateElement` during gestures. Do not let the autosave timer persist a transient draft halfway through a drag.

Pointer cancellation, Escape, lost capture, unmount and room switching must clear or deliberately finish the gesture according to existing tool behavior. A lost network connection alone must not discard the user's local action; allow its eventual commit to enter the local outbox.

Remote application preserves remote version, nonce and update metadata. It redraws and updates local durable cache, but never rebroadcasts or creates a local undo step. Existing undo/redo must produce new local versioned changes and not restore stale metadata or rewind unrelated remote work. Keep remote updates out of an active local history capture.

## 3. Extend and validate the protocol

Extend the existing connection rather than opening separate presence and element sockets. Introduce a versioned collaboration protocol and update both sides together. Retain existing presence variants. Suggested additional variants are:

| Direction | Message | Purpose |
| --- | --- | --- |
| Client to server | `scene.sync.request` | Request authoritative committed scene on every connection/reconnection. |
| Server to client | `scene.sync.snapshot` | Committed elements, ordering/tombstone metadata, authoritative revision and request correlation. Full snapshots are allowed only for sync. |
| Client to server | `elements.commit` | Stable client mutation ID, bounded array of changed complete element records, and applicable sync generation. |
| Server to other clients | `elements.committed` | Authoritative winning delta with sender connection identity and scene revision. |
| Server to sender | `elements.ack` | Correlate mutation ID; include authoritative winners needed to correct a lost local conflict, and durable success status. |
| Both directions | `elements.preview` | Gesture ID, sequence, base committed metadata and bounded temporary geometry for changed IDs. |
| Both directions | `elements.preview.end` | Explicitly clear a gesture, including cancellation or a no-op final gesture. |
| Both directions | `selection.update` | Bounded list of selected element IDs, ephemeral. |

Names may change if all consumers and validators agree. Identity and room are assigned from the authenticated connection; client-supplied user/connection/room fields cannot authorize or spoof another participant. Validate both directions at runtime, including element-specific points/text/image references, finite geometry, version ranges, duplicate IDs, unknown fields/types and array sizes. Reject unsafe object fields and arbitrary JSON smuggling.

Define realistic total-scene, element-count, batch-byte, text and point-count limits. The old 8 KiB presence limit is too small for many drawings; raise limits intentionally and chunk bounded snapshots/commits when needed. Do not truncate geometry silently. Rate budgets must allow roughly 30 preview frames/second alongside 30 cursor frames/second, selection and commits without starving committed updates. Drop/coalesce old previews under backpressure; committed updates must remain acknowledged/retriable or force a reconnect/resync, never silently disappear. Bound queues and incomplete chunk assemblies.

## 4. Durable authority and concurrent save safety

Use the server as the authority for durable acceptance. A WS commit calls a shared backend merge service which authorizes the role, reads the latest stored scene, reconciles only changed records and persists through `packages/db`. Acknowledge durable success after the write succeeds; broadcast authoritative accepted changes to other sockets, excluding only the sending connection. Another tab of the same user must receive the update.

For immediate visual feedback, relay an authorized, validated final-element display frame before waiting for persistence. Treat that frame as a temporary overlay, never as a durable acknowledgement or canonical scene update. Clear it on authoritative delivery, rejected save, disconnect or timeout. Do not clear the last drag preview before the final-frame handoff. Revision cleanup runs as coalesced background maintenance and must not delay acknowledgement or fan-out.

Implement atomic merge/save using Prisma transactions with appropriate isolation/retry, or a persisted scene revision plus compare-and-swap and bounded retry. A plain read followed by an unconditional full JSON update loses another user's changes. A transaction at ordinary read-committed isolation alone is not sufficient to prevent that race. A per-process mutex alone cannot coordinate the separate HTTP and WS services. Keep transaction/query implementations in `packages/db`; put shared policy/orchestration in `packages/backend-common`.

Convert or retire the old room whole-scene autosave path, and route all remaining room-backed HTTP writes through the same merge service. Preserve files, title and other unrelated scene metadata during merges. Avoid duplicate HTTP and WS persistence loops. Standalone personal scenes and the guest canvas must still work.

The authority must reject viewer commits and previews, recheck edit permissions when accepting mutations, and stop edits after a role downgrade. Selection/cursor permissions may remain read-only presence permissions. Membership revocation still closes sockets. Handle database failure without reporting saved or deleting the outbox. Duplicate mutation IDs and duplicate records must be idempotent; no increment on replay. If an accepted commit loses an acknowledgement or fan-out, reconnect and snapshot reconciliation must recover it.

Images are an integration requirement: element metadata can travel over WS, while image bytes stay on the existing authorized file/HTTP path. Ensure referenced files are durably available to other members before claiming the image commit is saved, and that collaborators can fetch/render them. Preserve existing file data when saving; do not put blobs or data URLs into preview frames. Document any small extension needed to the existing file path instead of silently leaving image collaboration broken.

## 5. Initial sync, IndexedDB and stale reconnect

Scope local drafts and the committed outbox by account, room and scene identity. Migrate IndexedDB without destroying the guest `current` drawing or personal scenes. Never reconcile a draft from another room/account into this room. Persist pending committed edits locally before relying on socket delivery; replay the same metadata and mutation ID until durable acknowledgement.

Every successful socket connection requests an authoritative snapshot. Merge it with the room's local committed state using `reconcileElements`; do not blindly replace local offline changes or use the ordinary import path. Buffer/sequence deltas arriving during snapshot assembly, then reconcile them too. Initialize one canonical room scene and gate outbox replay until sync metadata is available. Cancel obsolete loads and message handlers after room changes, sign-out or a newer connection generation.

After merge, send only pending/local winning changed elements needed by the authority. The server response reconciles any losing local changes. Mark the outbox entries complete only after durable acknowledgement or authoritative confirmation of the same/newer accepted state. Keep presence `live`, scene `syncing` and `saved` meanings distinct. Do not label an open socket as proof that a commit is durable.

While the user is dragging an element, do not apply remote committed geometry to that element's local preview. Retain the highest incoming committed record rather than dropping it. At completion or cancellation, reconcile the local committed result and deferred remote state, remove the preview, and converge. Observe remote versions while dragging so a subsequent local commit can use the maximum observed base version plus one when appropriate. Whole-element last-write-wins can discard a concurrent change; do not promise field-level merging.

On reconnect clear obsolete remote previews and selections, obtain fresh auth, request a snapshot and replay pending commits. Test the two-minute offline case while both users change overlapping and disjoint elements. Refreshing the offline browser must retain already committed local changes. An unfinished gesture is ephemeral and must not be reported as a saved edit.

## 6. Drag and selection rendering

Publish latest in-progress drag/create/resize geometry at about 33 ms, with gesture identity and monotonically increasing per-gesture sequence. Base it on committed version/nonce without increasing them for each frame. Remote previews live in a separate render layer; a new element may appear there before the final commit. Ignore late/out-of-order frames, previews based on superseded commits and previews for locally active gestures.

Clear previews on final commit, explicit end/cancel, disconnect, participant leave, reconnect and a bounded inactivity timeout. Multiple tabs have separate connection identities. A preview must never override an accepted final state. Avoid persisting remote previews through ordinary autosave subscriptions.

Broadcast selection changes as element IDs only. Render faint outlines using the same user-derived color as cursors, with per-connection selection state. Do not mutate element styles, local selection or history. Handle rotated shapes, local pan/zoom, missing/deleted IDs and two users selecting the same element. Clear selections on leave/reconnect and prune stale IDs. Keep existing text/input focus and canvas hit testing intact.

## 7. Soft deletion and safe pruning

Deletion, erasing and deletion through undo emit versioned `isDeleted: true` records; absence from a delta is never deletion. Deleted elements are excluded from drawing/hit-testing/export but retained for reconciliation until safe compaction. Undelete is a new higher-version committed edit.

Prune old deleted element bodies at save time using a documented retention period, for example seven days, based on authoritative deletion acceptance time. Do not trust a client's wall clock to immediately expire a tombstone. A non-deletion update timestamp is not a reliable deletion age.

Retain compact durable deletion metadata (ID, winning version/nonce and deletion time) after removing a body from the scene array, and include the necessary metadata in initial sync. Reconciliation must reject older stale live records using this metadata. A higher-version intentional undelete can win and must remove/update the compact deletion entry atomically. A generation/watermark design is also acceptable if it rigorously prevents stale drafts from resurrecting old deletions and preserves pending edits.

Never implement pruning as only `elements.filter(...)`: after pruning, missing-ID acceptance would revive deleted shapes from an offline draft. Test pruning and stale replay together. Compact metadata still consumes storage; do not claim bounded total history without a demonstrated safe metadata-retention policy. Do not prune the active gesture or current undo data out from under the engine.

## Implementation and commit sequence

Use small commits in this order, adjusting a boundary when dependencies require it. Include the focused tests with the slice they verify. Keep intermediate package exports and builds working.

1. Record architecture; add shared reconciliation, normalized metadata, ordering and table-driven tests.
2. Add engine commit/remote-apply/preview APIs; integrate tools and history with focused interaction tests.
3. Add Prisma-backed atomic merge/revision and tombstone persistence; shared backend authorization/service; fix room-backed HTTP writers and concurrent-save tests.
4. Extend shared protocol/validators and WS commit/snapshot/ack transport; test auth, roles, room isolation, idempotence, limits and durable failures.
5. Add room-scoped IndexedDB draft/outbox and reconnect/initial-sync integration on the existing connection.
6. Add transient drag rendering and selection outlines with cleanup/backpressure tests.
7. Finish file-reference integration, safe pruning/reconnect regressions and any remaining end-to-end fixes; update docs and verification record.

Do not stage unrelated user changes. The working tree already contained a modification to `packages/backend-common/tsconfig.tsbuildinfo` when this handoff was prepared; inspect current status and treat existing changes as user-owned. Do not commit generated caches, temporary harnesses, screenshots containing credentials, `.env` files or secrets. Preserve lockfile changes only when actual dependency changes require them.

## Required verification: basic checks with a stopping point

Use a small set of checks appropriate to the changed code. Run the affected focused tests once, a type check for affected packages, and frontend lint when UI code changes. For a broad Phase 15 implementation, run one root type check and one build at the end. Do not repeatedly run every package suite or retry successful checks. Broaden testing only to investigate a concrete failure or remaining risk.

Add focused regressions for reconciliation, concurrent durable saves, immediate final-element display, and pending/outbox recovery when these paths change. Use existing harnesses instead of building a large testing framework. Give each test command a reasonable time limit (normally two minutes for focused tests, five minutes for a build). If it hangs, stop it, inspect the output and fix the cause; do not loop indefinitely. Report an unavailable environment check accurately and continue independent work.

Perform one basic two-browser smoke check: create and finish a shape (the final styled shape should appear immediately while its save is pending), move it, delete it, and briefly disconnect/reconnect one browser. Confirm both scenes converge and a reload retains saved changes. If the two-minute offline scenario has not already been exercised, run it once. Do not repeat the full tool matrix or every acceptance scenario after an unrelated small fix.

Record the commands, basic smoke result and any actual unverified behavior in `docs/phase-15-verification.md`. Once the relevant checks pass, stop testing, review the diff, commit and push the coherent changes. Do not claim an unperformed browser check passed.

## GitHub delivery and definition of done

Inspect the branch and remote first. Use a `codex/phase-15-element-sync` branch if a new branch is appropriate; follow any existing user-authorized branch workflow. Review staged diffs for each slice, commit with descriptive messages and push the sequence to GitHub. Do not squash the implementation into one large commit. If creating a PR, describe the final behavior and validation and attach it to the task through the app's PR attachment tool.

Deliver a concise report with implemented behavior, test/manual evidence, commit IDs, branch/PR URL when applicable and material limitations. Phase 15 is complete only when the ten requested capabilities work together, committed state survives reload/restart, stale reconnects converge without deletion resurrection, Phase 14 still works, required checks pass, and all intended changes are pushed with unrelated changes preserved. Stop at Phase 15.

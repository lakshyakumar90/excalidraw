# Phase 16 agent handoff: Redis and the write-behind queue

Implement Phase 16 end to end using this specification, verify the important paths with basic focused checks, and commit/push small coherent steps. Inspect current code and applicable `AGENTS.md` instructions first. This document describes an implementation plan, not completed Phase 16 code. The repository baseline is the Phase 15 branch inspected on 2026-10-09.

## Required outcome

Room commits update live state in Redis immediately. Initial sync reads that state. One separately running BullMQ worker persists the latest dirty room snapshot to PostgreSQL after a quiet interval, with a maximum wait during continuous drawing. Global last-disconnect requests an immediate flush and safe cache expiry. Multiple WS instances share committed edits and presence through Redis pub/sub. Keep a bounded snapshot history and expose useful operational measurements.

For normal active editing, target one logical PostgreSQL scene-snapshot write per room per 5–30 seconds, independent of participant/message count. Last-disconnect, recovery, and explicit administrative operations can trigger an immediate write. Snapshot retention and authorized image-file uploads are separate maintenance/asset operations; measure them separately. Do not describe this target as a literal limit on every database query. Do not promise sub-millisecond network response: measure Redis round-trip and merge latency on the actual deployment.

Preserve Phase 15 higher-version/higher-nonce reconciliation, stable ordering, tombstones, room drafts/outbox, correct shape previews, immediate final-element display, image availability, undo/redo, ticket security and role checks. Preserve standalone personal scenes and guest behavior. Stop at Phase 16.

## Ownership and existing integration points

| Location                  | Owns                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/common`         | Browser-safe sync messages, accepted/persisted receipt types, scene-generation identifiers, limits and existing reconciliation.                                                            |
| `packages/db`             | Existing Prisma client, PostgreSQL initialization, snapshot history queries and required Prisma schema/migrations. No other package/app initializes Postgres.                              |
| `packages/auth`           | Existing Better Auth and ticket issue/verify. WS retains `@repo/auth/presence-ticket`.                                                                                                     |
| New `packages/redis`      | Backend-only Redis connections, key conventions, atomic room-state operations, infrastructure types and orderly connection shutdown. Never import it in browser code.                      |
| `packages/backend-common` | Shared HTTP/WS/worker orchestration: authorized room operations, flush scheduling, snapshot conversion, receipts, pub/sub routing policy and metrics helpers.                              |
| `apps/ws-server`          | Authenticated transport and local sockets. Calls shared live-state services; relays shared events without feedback loops.                                                                  |
| `apps/http-server`        | Authorized room reads/writes and file paths using the same live-room authority.                                                                                                            |
| New `apps/flush-worker`   | The BullMQ worker entry point, concurrency 1 for this phase, queue lifecycle, dirty-room recovery, persistence and health/metrics. Do not launch a worker inside every WS or HTTP process. |
| `apps/web`                | Accepted-versus-saved status, persisted outbox lifecycle, reconnect and missed-event recovery.                                                                                             |

Redis initialization belongs in the dedicated Redis package; auth remains in auth. Backend orchestration goes in backend-common only when shared by backend applications. Common remains free of Redis, BullMQ, Node and database imports. Use Prisma queries and the repository's Prisma migration/contract scripts for PostgreSQL changes. Redis atomic scripts are permitted; they do not justify raw SQL or a new app-level database client.

Inspect `packages/backend-common/src/collaboration.ts`, `packages/db/src/prisma/sceneSync.ts`, `apps/ws-server/src/server.ts` and `roomStore.ts`, HTTP room and owner scene routes, browser `roomSync.ts`/`outbox.ts`, `SyncStatus.tsx`, the scene/file types and worker/build configuration. Phase 15 currently appends a `SceneRevision` on every accepted commit and prunes older revision rows. Replace that write-per-commit path and its head-only retention behavior. Update the Phase 15 architecture note, which has older statements about `Scene.data` being the head; current reads actually prefer `SceneRevision`.

Create `docs/architecture/phase-16-decisions.md` before implementation, recording installed Redis/BullMQ versions and the selected atomic merge, scheduling, receipt, persistence, connection-lease and recovery designs. The designs below are the defaults; do not leave competing room authorities.

## 1. Redis configuration and room-state model

Add pinned compatible Redis-client/BullMQ dependencies and lockfile changes. Prefer a client supported by the selected BullMQ version; inspect current official documentation before implementing version-specific APIs. Use separate command, subscriber and BullMQ connection roles. Subscriber/blocking connections must not accidentally handle ordinary commands. Configure appropriate bounded application request failures and worker retry settings.

Provide shared root environment examples and development instructions for `REDIS_URL`, queue prefix, flush quiet interval (default 5 seconds), max wait (30 seconds), idle grace (120 seconds), snapshot history count (20), metrics interval and Redis persistence. Support Docker or a managed Redis URL on Windows; do not make WSL mandatory. Never commit real URLs/secrets. Preserve service-local environment overrides and current compiled-package build caching.

Use namespaced per-room keys, with a common `{roomId}` hash tag for keys used together in an atomic Redis operation:

- `...:{roomId}:elements`: hash, element ID to serialized normalized complete element.
- `...:{roomId}:meta`: scene ID, generation ID, current room version, PostgreSQL persisted version, initialization state and timestamps.
- `...:{roomId}:tombstones`: compact deletion metadata, including authoritative deletion time.
- `...:{roomId}:dirty`: first dirty time, last committed-change time and desired due time.
- `...:{roomId}:connections`: expiring connection leases used for global occupancy.
- A bounded receipt/dedup structure and a global dirty-room recovery index.

Keep file bytes out of element hashes, previews and pub/sub messages. Preserve existing authorized HTTP file transport, and define how files/appState/title survive snapshot construction. Image metadata cannot receive a saved receipt before required bytes are available. Do not copy large image data URLs on every Redis element update.

Treat Redis live room state as data awaiting persistence, not an evictable cache. Use a dedicated/configured Redis deployment with `noeviction`, persistent storage and an explicit AOF policy, for example `appendfsync everysec`. That policy has a crash-loss window; do not claim zero-loss durability. Keep local committed outbox data until PostgreSQL persistence is confirmed. Set limits for room size, element bodies, receipt retention, buffers and idle-room memory.

## 2. Atomic commit acceptance

Reuse `packages/common` reconciliation exactly, including equal-metadata handling, ordering and tombstones. Concurrent HTTP writers and WS instances must not overwrite each other's changes. A practical implementation is: read room version and affected records, compute winners in TypeScript, then apply them through a Lua compare-and-swap operation that verifies the expected version; retry conflicts within a bound. Use an equivalent atomic design if it preserves the same tested semantics. Avoid independently reimplementing subtly different reconciliation in Lua.

One successful atomic operation updates changed records/tombstones, increments the room version only for a real state change, stamps dirty timing, records receipt information and marks the room in a recoverable dirty index. Duplicate mutation IDs and no-op/older records must not invent a new version. Validate input and authorize membership/edit role server-side; room IDs, Redis keys and client identity are not authorization.

Queue insertion follows acceptance, but BullMQ scheduling and a live-state update are not one ordinary transaction. The durable dirty index must recover the crash between them. If scheduling fails, retain the dirty state and retry/recover it; do not claim the PostgreSQL flush already happened. If Redis is unavailable or memory is exhausted, reject/leave commits pending and keep the local outbox. Do not silently fall back to per-edit PostgreSQL writes while other nodes use Redis, which would create conflicting authorities and restore the write storm.

Advance live state and fan out accepted winners as soon as Redis accepts them. Preserve temporary final geometry during any handoff. No PostgreSQL write, snapshot-history cleanup or metrics query belongs in the per-element delivery path.

## 3. Initial sync and cold-room warming

Authorized joiners read committed elements, version, generation, persisted watermark and tombstones from a coherent Redis snapshot. Do not assemble a hash and counter from different revisions. Use an atomic bounded read, or verify/retry the version around a read. Preserve existing chunk limits and snapshot/delta buffering.

Only an uninitialized cold room falls back to the current PostgreSQL head. Serialize warming across instances with a token-based initialization lease and guarded installation. If the lease expires during the DB read, an old initializer must not overwrite a newly initialized room. Do not allow edits into a half-loaded room. Seed the Redis version from the stored snapshot, normalize legacy state deterministically and preserve deletion metadata/files references.

Generate a new room-state generation on a genuine rebuild after Redis state loss. Accepted client receipts must include that generation so clients can replay pending local commits after losing a volatile live head, rather than treating a reused numeric version as proof of durability. An ordinary warm reconnect does not change generation.

All room reads and writers, including generic owner scene endpoints for room-backed scenes, must resolve through the same live authority. The old HTTP whole-scene/per-edit revision path must not bypass it. Personal scenes can keep their existing path.

## 4. BullMQ scheduling: fixed ID, quiet interval and max wait

Use one flush queue. Each room's pending flush has a fixed room-derived ID such as `jobId: "room-" + roomId`. This implements the requested room-ID deduplication without passing a digits-only custom ID: current BullMQ documentation rejects integer-form custom IDs as well as colon-containing IDs. Queue data contains room/scene identity, not a stale copied scene. Verify ID rules against the installed version.

Important: adding an existing fixed job ID ignores the duplicate; it does not automatically reset its delayed execution. Implement real rescheduling using supported delayed-job APIs, or BullMQ's documented debounce/dedup facilities with the required options while preserving one pending room flush. Inspect the installed API and prove the chosen lifecycle with a focused integration check.

Set the intended deadline to:

```text
min(lastDirtyChangeAt + quietInterval, firstDirtyAt + maxWait)
```

Keep `firstDirtyAt` stable until the relevant dirty version is persisted. Continuous drawing therefore cannot push the deadline past 30 seconds. Use a consistent server/Redis clock. Treat the deadline as a target under healthy worker load; instrument queue lag, because delayed jobs are not a guarantee of execution at an exact millisecond.

Handle delayed, waiting, active, completed and failed job states explicitly. New edits while a job is active must remain dirty and schedule a successor after completion. Do not remove a worker-owned active job to force an immediate flush. Completed jobs must not permanently reserve the fixed ID; bound failed-job retention and recover failed jobs without blocking future room flushes.

Add a small recoverable dirty-room scan/reconciler that ensures every dirty room has a runnable job, including after a process crash between acceptance and queue insertion or between worker completion and scheduling a successor. It may enqueue due jobs; it must not become a second database writer. Store due times in Redis and make repeated scans harmless across instances. Keep it proportional to dirty rooms, not a full scan on every edit.

## 5. Flush worker and persistence watermark

One worker with concurrency 1 reads a coherent current room snapshot and its version `V`. Read the current PostgreSQL persisted version and skip unchanged or older work. Insert at most one new scene snapshot for `V`; room versions can have gaps between snapshots. Preserve unique `(sceneId, revision)` protection and handle retries/unique conflicts by reading the stored winner. Use the existing Prisma model/query layer, extending it through Prisma migrations if necessary.

Never mark Redis clean before PostgreSQL persistence succeeds. After the DB write, advance Redis's persisted watermark to `V` atomically. Clear dirty state only if Redis still has version `V`; if edits advanced it to `V+1`, those edits stay dirty and get another scheduled job. A crash after the DB write but before the Redis watermark update is recovered by comparing the stored head on retry. A repeated flush must not add another identical snapshot or regress the head.

Preserve element versions/nonces and compact deletion metadata; a flush does not create another user edit. Snapshot actor/provenance must use valid existing user references or a deliberate schema change, never an invented user ID that violates a foreign key. If the scene/room was deleted or rebound, reject stale job identity and clean up safely; do not recreate deleted rooms.

Retry transient DB failures with bounded exponential backoff, keep dirty Redis data, and expose failures/lag. After retries exhaust, the recovery mechanism must be able to retry later without losing work. Shutdown stops new jobs, allows an active write a bounded opportunity to finish and closes clients gracefully; a queued job must remain recoverable when the process exits.

## 6. Receipts, browser outbox and truthful status

Version the protocol as needed and distinguish:

- Accepted into live Redis state: authoritative resulting elements, generation and room version.
- Persisted to PostgreSQL: generation and persisted version watermark emitted after a flush.
- Rejected/unavailable: keep the pending edit on the device and show the reason.

Do not return the old `saved: true` merely because Redis accepted a commit. Mark local outbox entries accepted to suppress constant duplicate resends, but retain them durably until their accepted version is covered by the persisted watermark for that generation. Replay unresolved entries on a new generation or loss of acceptance information. Return authoritative corrections for losing edits as Phase 15 does.

Show useful states such as `Live · saving…`, `All changes saved`, `Reconnecting` and `Offline · edits waiting`. Do not report every connected browser as saved while its data is only in a dirty Redis head. A persisted watermark can arrive through pub/sub or a fresh snapshot; reconnect must recover missed receipts. Keep cursor/selection/preview frames ephemeral and outside the outbox/history/snapshots.

## 7. Global last disconnect and safe expiry

Maintain global per-connection leases in Redis, not only the WS process's room map. Two tabs count separately. Heartbeat renews leases; disconnect removes its lease; expiry/recovery removes dead-instance leases. Only a globally empty room triggers the last-disconnect path. A server crash must eventually be treated as departure.

Request an immediate queue flush when global occupancy reaches zero. Promote/reschedule the delayed room job using supported BullMQ APIs. If the job is already active, record an immediate follow-up requirement instead of competing with it. Verify a room emptied on one node while still occupied on another is not expired.

Apply the grace TTL to the complete room-key set only after persistence covers the current version and the room is still globally empty. Re-check this atomically so a new join/commit cancels expiry. Never expire dirty room state during a DB outage. Receipt and lease structures need explicit bounded cleanup; BullMQ queue keys have their own lifecycle and must not receive a room cache TTL.

## 8. Last N versioned snapshots

Retain the latest configurable N persisted snapshots per scene, default 20, using existing `SceneRevision` where practical. Replace the current Phase 15 cleanup that deletes all older heads. Retention runs after a successful flush as bounded background maintenance, not on every incoming commit. It must preserve the latest head and the idempotency/version invariant across concurrent/retried work.

Keep snapshot listing/authorized retrieval small and optional unless needed for verification. Record snapshot time, room revision and provenance. A complete restore/history UI is outside this phase; if exposing restore, it must become a new live room operation/version, not reset counters or resurrect stale state by replacing the DB behind Redis.

## 9. Horizontal fan-out with Redis pub/sub

Subscribe WS instances to the shared room events before claiming horizontal deployment support. Each event has a server instance ID, event ID, authenticated sender connection ID, room/scene identity and, for committed state, generation/version. Publish accepted winner deltas, persisted receipts and ephemeral preview/pointer/selection/participant events. Route only to locally connected authorized sockets in that room.

Choose one delivery policy to avoid loops: local source fan-out once plus pub/sub delivery only on other instance IDs, or delivery through the subscriber everywhere. Never republish received events. Exclude only the actual sending connection; another tab of that user still receives updates. Preserve correct ellipse previews and display names without exposing emails.

Redis pub/sub has at-most-once delivery and no replay. On subscriber reconnect, version gaps, process restart or a periodic lightweight version check detecting divergence, re-sync affected local rooms from Redis. A missed final event with no subsequent messages must also be recoverable. Do not use pub/sub as a durable queue or rely only on observing a future event to discover a gap. Keep snapshots/deltas buffered coherently during resync. Bound event sizes and drop/coalesce ephemeral frames for slow clients while committed state stays recoverable.

Redis connection leases/global participant state must make avatars and join/leave behavior consistent across nodes. WS room maps retain only local socket references; they are not the global occupancy authority. Read-only/nonmember/revoked behavior and periodic role/membership checks remain enforced on every instance.

## 10. Instrumentation and operating limits

Aggregate counters at a short configurable interval instead of logging every pointer frame. Record per-room incoming messages/second (commit versus ephemeral), accepted/no-op changes, Redis operation latency, queue depth/oldest due age, snapshot flush count, duration, failure/retry/skip counts and accepted-minus-persisted version lag. Sample Redis memory through its supported information API at a reasonable global interval, not per socket message.

Use structured logs with instance/room/scene/version identifiers. Never log tickets, secrets, element text, file payloads or full snapshots. Bound room-label cardinality for metrics and remove idle labels. A metrics scrape/export integration is optional; readable aggregated structured logs meet this phase if documented and actually emitted.

Expose process health/readiness that distinguishes HTTP/WS availability, Redis connectivity and worker/queue health. Alert or visibly report persistently dirty rooms, delayed worker progress, Redis memory pressure and pub/sub reconnection. Document single-worker throughput limits; do not claim many dirty rooms will all flush within 30 seconds under overload.

## Small implementation/commit steps

1. Architecture decisions, configuration, dedicated Redis package and basic Redis/dev setup.
2. Atomic live-state merge, tombstones, receipts/generation, cold warming and coherent reads.
3. Shared scheduling/dirty recovery and standalone BullMQ worker; Prisma snapshot persistence/retention.
4. Route WS and all room-backed HTTP operations through Redis; browser accepted/persisted outbox/status behavior.
5. Global connection leases, last-disconnect flush and guarded grace expiry.
6. Cross-instance pub/sub, participant/preview fan-out, deduplication and reconnect/gap resync.
7. Instrumentation, operational docs and focused verification fixes.

Add the tests needed for each risky slice alongside it. Keep exports, workspace startup and dependency builds usable between commits. Review staged diffs; commit descriptive small steps and push them to GitHub on the user's current branch workflow. Do not squash everything into one giant commit. Do not commit credentials, generated caches, local Redis dumps/volumes or unrelated changes. If creating a PR, attach it to the task through the app's PR attachment tool. Do not merge or deploy unless authorized.

## Basic verification and a stopping point

Use one focused Redis/BullMQ integration harness against a dedicated test Redis namespace/database and test PostgreSQL database. Keep intervals short under test and use a controllable clock/explicit job state checks where possible; do not make the suite wait 30 real seconds for every case. Never flush/reset a user's shared Redis or database.

Cover these high-value cases in a small number of tests:

1. Concurrent commits from two instances and a cold-warm race preserve winners, ordering/tombstones and a coherent initial snapshot; replay does not increment versions.
2. A burst coalesces to one delayed room flush; continuous changes hit the max-wait deadline; edits during a held active flush survive into a successor job.
3. Duplicate/retried flushes produce one snapshot for the version; a crash between write/watermark is recoverable; failed queue insertion remains discoverable through the dirty index.
4. Global last disconnect promotes a flush; another node's live connection or a rejoin prevents expiry; DB failure never expires dirty data.
5. Cross-node committed/preview/selection/presence events fan out once; missed pub/sub delivery triggers resync; accepted browser outbox data stays until persisted and replays after generation loss.

Run affected focused suites once, relevant type checks, and frontend lint only when frontend code changes. Do one build at the end of this broad infrastructure change. Give focused commands roughly two minutes and builds roughly five minutes; diagnose a stall rather than looping. Stop successful testing. Do not repeatedly run every package suite or build a large load-testing framework.

Do one short two-browser smoke check with each browser connected to a different WS instance: ellipse drawing/commit, both cursors, one deletion, a brief disconnect/reconnect and reload after a successful flush. Observe that normal commits do not append a PostgreSQL row each time and that a burst produces one snapshot. Exercise worker retry and one instance restart once with the focused harness or controlled test services. Record exact commands, counts, timing, observed write frequency and any genuinely unverified scenario in `docs/phase-16-verification.md`.

Completion requires all ten Phase 16 features to work together, basic checks to pass, receipts/status to describe real durability, Redis/queue/worker recovery to preserve pending work, Phase 15 behavior to remain intact, and intended commits to be pushed. Report material limitations honestly instead of claiming zero latency, guaranteed exact deadlines or complete Redis-crash durability.

## Primary references to verify during implementation

- [BullMQ job IDs](https://docs.bullmq.io/guide/jobs/job-ids): fixed-ID duplicates are ignored; check cleanup and ID restrictions for the installed version.
- [BullMQ deduplication](https://docs.bullmq.io/guide/jobs/deduplication): distinguish throttle and debounce settings before implementing timer resets.
- [Redis pub/sub](https://redis.io/docs/latest/develop/use-cases/pub-sub/): at-most-once delivery requires the resync strategy above.
- [Redis persistence](https://redis.io/docs/latest/management/persistence/): document the actual AOF/RDB policy and its loss window.

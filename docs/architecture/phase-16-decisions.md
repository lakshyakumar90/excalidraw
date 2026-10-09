# Phase 16 implementation decisions

## Runtime packages

- `packages/redis` owns Redis clients, the room snapshot hash, presence leases, Pub/Sub, metrics, and the BullMQ queue. It uses `ioredis` 6.0.0 and `bullmq` 6.3.12.
- `packages/backend-common` uses an injected Redis room store for shared commit validation and reconciliation. The HTTP server, WebSocket server, and flush worker use the shared `packages/db` Prisma client for PostgreSQL.
- `apps/flush-worker` owns the one-concurrency queue worker. Run it as its own app process; do not start a worker in either request server.

## Live snapshots and commit receipts

- Each scene has a Redis hash containing a monotonically increasing revision, metadata, and serialized element fields keyed by element ID. The metadata carries app state, files, tombstones, actor ID, and dirty timestamps.
- A Redis Lua compare-and-set checks the expected revision, replaces the element hash, updates the room revision, and marks the room dirty atomically. A missing cache accepts the first writer after the collaboration service has read the latest Prisma head.
- Collaboration acknowledgements distinguish `saved` (accepted in Redis) from `persisted` (durable in PostgreSQL). The browser keeps accepted commits in IndexedDB until it receives `scene.persisted` for that revision.
- PostgreSQL remains authoritative for cold rooms. The latest Prisma `SceneRevision` is used to initialize an empty Redis room; normal live sync reads Redis first.

## Flush behavior

- The queue uses one stable, hashed job ID per scene. Pending jobs are replaced to debounce edits by five seconds; the first dirty timestamp caps the delay at 30 seconds. Last disconnect schedules an immediate flush.
- The Redis dirty-room sorted set is the recovery source if enqueueing fails or a newer version arrives while the fixed-ID job is active. The worker scans it every five seconds.
- The worker reads one current snapshot, skips a revision already stored in Prisma, inserts the snapshot through `insertSceneRevision`, and retains the newest 20 rows. Redis advances its persisted watermark only after the Prisma step succeeds.
- Connection leases expire after 60 seconds and are renewed on the WebSocket heartbeat. A room snapshot is expired after a 60-second grace period only after it is persisted and no live leases remain.

## Horizontal delivery and telemetry

- Redis Pub/Sub relays room presence and collaboration broadcasts between WebSocket instances. Each process ignores messages it published itself.
- The worker logs rolling room message rates, snapshot flush count and latency, and Redis `used_memory`.
- `compose.yaml` provides a local Redis 7.4 service with AOF enabled. `REDIS_URL` is required by the HTTP server, WebSocket server, and flush worker.

## Verification status

- Backend package type checks and the focused collaboration, WebSocket, and browser outbox tests pass.
- The Redis integration test is opt-in through `REDIS_TEST_URL`. It could not run in the implementation environment because no local Redis was listening and Docker could not resolve the image registry. Run it after starting Redis with `REDIS_TEST_URL=redis://127.0.0.1:6379`.

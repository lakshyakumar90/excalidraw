# Scalability and performance

## Implemented mechanisms

- Renderer has culling, bitmap cache and render-loop modules under `packages/engine/src/renderer`; web has diagnostics and a renderer benchmark page.
- PostgreSQL indexes cover ownership/update lookups, membership uniqueness and revision uniqueness.
- Redis separates low-latency room state from durable PostgreSQL records and coordinates leases/pubsub/queue.
- WebSocket has per-connection message budgets, heartbeat cleanup and periodic membership/role rechecks.
- Flush worker concurrency is configured as 1; dirty-room recovery runs at startup and every 60 seconds; old revisions are retained within `ROOM_SNAPSHOT_KEEP`.
- Turbo caches build outputs using declared task inputs/environment.

## Risks to measure

Large JSON scenes and a 50 MB body ceiling can raise parse/memory/serialization costs. Large rooms increase fanout and connection state. Frequent snapshots can amplify Redis and DB writes. Canvas CPU work can block the browser main thread. DB pool and worker concurrency must match provider limits. `/health` checks only the process.

## Scaling path

Instrument request latency, SQL plans/pool waits, room size/message rate, Redis memory/queue depth and flush lag. Set payload/room quotas. Profile realistic large drawings on mobile. Scale stateless HTTP behind a load balancer. Scale WS only with shared fanout/leases, proxy upgrade support, draining and cross-instance tests. Increase worker concurrency after idempotency/order guarantees are proven. Add caches only for measured repeated reads with explicit invalidation. Consider DB pool tuning, replicas or partitioning only from observed workload.

No SLOs, load results, autoscaling settings or production sizing values were established in this inspection. These are recommendations, not present capabilities.

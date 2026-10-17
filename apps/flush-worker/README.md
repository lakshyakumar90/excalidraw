# flush-worker

BullMQ worker that flushes Redis room state to durable Prisma snapshots.

## Subfolders

- [src](./src/README.md)

## Files

- `package.json` — workspace scripts and dependencies.
- `tsconfig.json`

## Working here

Keep changes within this folder’s responsibility. Follow the owning app/package README for setup and checks; use shared packages for reusable logic. Do not edit build output or store credentials here.

## Running and checking

From the repository root:

```sh
pnpm --filter flush-worker dev
pnpm --filter flush-worker build
pnpm --filter flush-worker check-types
```

Use root `pnpm dev` to start all services with build dependencies. See [workspace setup](../../README.md) for environment and migration guidance.

Recovery runs at startup and every 60 seconds after the previous scan completes.
Normal room saves still enqueue with a five-second debounce. BullMQ blocks for
up to 60 seconds when empty, waking immediately when a job arrives; stalled-job
checks run every 60 seconds. Crash recovery can therefore take longer than normal
saves. Slow or failed maintenance requests never create overlapping scans.

Redis message-rate and memory metrics are disabled by default. To enable them,
set `REDIS_METRICS_ENABLED=true` on the API, WebSocket server, and flush worker.
This adds per-message writes and ten-second polling; leave it disabled on a
command-limited plan. Snapshot flush logs remain available without it.

For one idle worker, the recovery scan, empty queue wait/activation, and stalled
checks use roughly 173,000 top-level commands over 30 days, before reconnects,
startup, or real activity. This is an estimate, not a provider billing guarantee;
multiple worker replicas multiply idle usage.

Run `pnpm --filter flush-worker test` for maintenance timing and outage tests.

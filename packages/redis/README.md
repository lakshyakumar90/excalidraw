# redis

Redis live room state, pub/sub, rate limiting, and write-behind queue integration.

Message metrics require `REDIS_METRICS_ENABLED=true` (disabled by default).
Queue producers share the main Redis connection; the worker owns its connections
and closes them on shutdown. See the [worker README](../../apps/flush-worker/README.md)
for idle command usage and recovery timing.

## Subfolders

- [src](./src/README.md)

## Files

- `package.json` — workspace scripts and dependencies.
- `tsconfig.json`

## Working here

Keep changes within this folder’s responsibility. Follow the owning app/package README for setup and checks; use shared packages for reusable logic. Do not edit build output or store credentials here.

## Checks

```sh
pnpm --filter @repo/redis check-types
pnpm --filter @repo/redis test
```

Read [root setup](../../README.md) for environment and migration guidance before commands that modify a database.

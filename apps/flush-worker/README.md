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

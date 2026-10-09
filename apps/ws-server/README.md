# ws-server

Authenticated room WebSocket transport for presence, scene changes, selections, and laser trails.

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
pnpm --filter ws-server dev
pnpm --filter ws-server build
pnpm --filter ws-server test
pnpm --filter ws-server check-types
```

Use root `pnpm dev` to start all services with build dependencies. See [workspace setup](../../README.md) for environment and migration guidance.

# http-server

Authenticated HTTP API for scenes, rooms, invites, files, and private library items.

## Subfolders

- [src](./src/README.md)

## Files

- `global.d.ts`
- `output.log`
- `package.json` — workspace scripts and dependencies.
- `tsconfig.json`

## Working here

Keep changes within this folder’s responsibility. Follow the owning app/package README for setup and checks; use shared packages for reusable logic. Do not edit build output or store credentials here.

## Running and checking

From the repository root:

```sh
pnpm --filter http-server dev
pnpm --filter http-server build
pnpm --filter http-server test
pnpm --filter http-server check-types
```

Use root `pnpm dev` to start all services with build dependencies. See [workspace setup](../../README.md) for environment and migration guidance.

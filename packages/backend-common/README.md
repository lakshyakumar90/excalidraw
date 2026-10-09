# backend-common

Server-only collaboration and access operations shared by HTTP, WebSocket, and worker apps.

## Subfolders

- [src](./src/README.md)

## Files

- `package.json` — workspace scripts and dependencies.
- `tsconfig.json`
- `vitest.config.ts`
- `vitest.setup.ts`

## Working here

Keep changes within this folder’s responsibility. Follow the owning app/package README for setup and checks; use shared packages for reusable logic. Do not edit build output or store credentials here.

## Checks

```sh
pnpm --filter @repo/backend-common test
pnpm --filter @repo/backend-common check-types
```

Read [root setup](../../README.md) for environment and migration guidance before commands that modify a database.

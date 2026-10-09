# common

Platform-neutral element models, collaboration protocols, validation, and reconciliation.

## Subfolders

- [src](./src/README.md)

## Files

- `package.json` — workspace scripts and dependencies.
- `tsconfig.json`
- `vitest.config.ts`

## Working here

Keep changes within this folder’s responsibility. Follow the owning app/package README for setup and checks; use shared packages for reusable logic. Do not edit build output or store credentials here.

## Checks

```sh
pnpm --filter @repo/common check-types
pnpm --filter @repo/common test
```

Read [root setup](../../README.md) for environment and migration guidance before commands that modify a database.

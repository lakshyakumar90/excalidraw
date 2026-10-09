# engine

Browser-independent drawing geometry, tools, renderer, scene capture, and history.

## Subfolders

- [src](./src/README.md)

## Files

- `package.json` — workspace scripts and dependencies.
- `tsconfig.json`

## Working here

Keep changes within this folder’s responsibility. Follow the owning app/package README for setup and checks; use shared packages for reusable logic. Do not edit build output or store credentials here.

## Checks

```sh
pnpm --filter @repo/engine test
pnpm --filter @repo/engine check-types
```

Read [root setup](../../README.md) for environment and migration guidance before commands that modify a database.

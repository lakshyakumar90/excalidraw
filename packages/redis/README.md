# redis

Redis live room state, pub/sub, rate limiting, and write-behind queue integration.

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

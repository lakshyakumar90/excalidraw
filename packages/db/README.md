# db

The sole Prisma schema, database client, repositories, migration graph, and schema snapshots.

## Subfolders

- [src](./src/README.md)

## Files

- `package.json` — workspace scripts and dependencies.
- `prisma-8.md`
- `prisma.config.ts`
- `tsconfig.json`

## Working here

Keep changes within this folder’s responsibility. Follow the owning app/package README for setup and checks; use shared packages for reusable logic. Do not edit build output or store credentials here.

## Checks

```sh
pnpm --filter @repo/db db:emit
pnpm --filter @repo/db db:migration-check
pnpm --filter @repo/db db:sign
pnpm --filter @repo/db db:migrate
pnpm --filter @repo/db db:update
pnpm --filter @repo/db check-types
```

Read [root setup](../../README.md) for environment and migration guidance before commands that modify a database.

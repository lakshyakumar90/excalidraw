# web

Next.js editor, account dashboard, and room access interface.

## Subfolders

- [public](./public/README.md)
- [src](./src/README.md)

## Files

- `AGENTS.md`
- `CLAUDE.md`
- `eslint.config.mjs`
- `next-env.d.ts`
- `next.config.ts`
- `package.json` — workspace scripts and dependencies.
- `pnpm-lock.yaml`
- `postcss.config.mjs`
- `tsconfig.json`
- `vitest.config.ts`

## Working here

Keep changes within this folder’s responsibility. Follow the owning app/package README for setup and checks; use shared packages for reusable logic. Do not edit build output or store credentials here.

## Running and checking

From the repository root:

```sh
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web test
pnpm --filter web check-types
```

Use root `pnpm dev` to start all services with build dependencies. See [workspace setup](../../README.md) for environment and migration guidance.

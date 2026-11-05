# Development and deployment guide

## Requirements and setup

Repository requirements: Node.js 24+, pnpm 11.25.0, PostgreSQL 15+, Redis. Email provider configuration is needed for delivery; Google OAuth is optional. Root manifest is the workspace version authority despite the nested web `packageManager` mismatch.

```sh
pnpm install
# Copy .env.example to .env and configure locally; copy apps/web/.env.example to apps/web/.env.local
# Start PostgreSQL and Redis; optional local Redis service:
docker compose up -d redis
# For a fresh database, from packages/db:
pnpm db:emit
pnpm db:migration-check
pnpm db:migrate
# At repository root:
pnpm dev
```

For an existing DB, inspect migration/schema state before applying changes; do not blindly sign/reset it. DB loader reads service `.env` before root `.env`.

## URLs and commands

Web `localhost:3000`, API `localhost:5000`, WS `localhost:8080`, Redis default `6379`. Root scripts: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm check-types`. Targeted tests: `pnpm --filter web test`, `@repo/common test`, `@repo/engine test`, `http-server test`, `ws-server test`, `flush-worker test`, `@repo/auth test`. DB scripts: `db:emit`, `db:migration-check`, `db:sign`, `db:migrate`, `db:update`. Read `packages/db/README.md` before database mutations. Root `format` writes files.

## Environment names

Database `DATABASE_URL`; Redis `REDIS_URL`, optional `REDIS_METRICS_ENABLED`; auth `BETTER_AUTH_SECRET`, optional `BETTER_AUTH_URL`, `WEB_ORIGIN`, `PRESENCE_TICKET_SECRET`, `ROOM_INVITE_SECRET`; OAuth `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; email `RESEND_API_KEY`, `EMAIL_FROM`; process `PORT`, `WS_PORT`, `WS_ALLOWED_ORIGINS`; browser `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`, optional `NEXT_PUBLIC_API_PROXY_PREFIX`; proxy `API_PROXY_TARGET`, `LEGACY_WEB_HOST`; tests may use `TEST_DATABASE_URL`, `REDIS_TEST_URL`. See `.env.example` files for per-variable notes. Never expose secrets through public `NEXT_PUBLIC_*` settings.

## Deployment and debugging

Repository contains Docker/compose, EC2+Caddy guide/config, Vercel configuration, InstaCloud and AWS notes, and a GitHub migration workflow. These represent deployment paths, not evidence of the current live topology. See `docs/aws-ec2-deployment.md` and `docs/instacloud-deployment.md`.

- `DATABASE_URL must be configured`: check local/root env and service working directory.
- Redis config/ping failure: start Redis and verify network/URL.
- Auth failures: verify API/web origin and distinct strong secrets.
- Browser API failure: compare public API URL, credentialed CORS origin and rebuild after public env changes.
- WS closes: check allowed origin, session/ticket, membership and proxy upgrade support.
- Unexpected caching: check Turbo task inputs/environment declaration.

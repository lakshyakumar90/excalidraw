# Testing and code quality

## Test architecture

- Web and most shared packages use Vitest (`apps/web/vitest.config.ts`, package configs).
- HTTP routes, WS server/store, worker and Redis tests use Node's test API through `tsx --test`.
- Colocated tests cover scene/room/library/guest-import routes; collaboration protocol/sync; engine geometry/renderer/tools/history; browser presence/persistence; auth email/tickets; Redis and worker maintenance.
- `packages/backend-common` has an integration test and setup using `TEST_DATABASE_URL` when provided. Redis tests use `REDIS_TEST_URL`.
- Root commands include `pnpm check-types`, `pnpm lint`, `pnpm build`; package tests include `pnpm --filter web test`, `@repo/common test`, `@repo/engine test`, `http-server test`, `ws-server test`, `flush-worker test`.

No coverage threshold/reporting was established in top-level config. This documentation task did not run tests/builds; no pass claim is made. Current colocated tests do not establish full browser E2E coverage, deployed auth behavior, backup recovery, multi-instance fanout, load limits or real touch/pen/screen-reader behavior.

## New feature workflow

1. Put shared contracts in `common` and validate untrusted runtime payloads.
2. Put editor-domain algorithms in `engine`; UI and browser APIs stay in `web`.
3. Add durable schema/repository only when needed; test migration and ownership access.
4. Add server checks for invalid, unauthenticated, unauthorized, duplicate and concurrent cases.
5. Wire UI to hooks/helpers with pending/error/retry and local persistence behavior.
6. Add deterministic unit tests and route/integration coverage for persistence/security.
7. Run targeted tests, then affected workspace typecheck/lint/build.

Root README calls for manual responsive checks on phone portrait/landscape, tablet, 1024px and desktop; touch/pen and assistive tech need real devices.

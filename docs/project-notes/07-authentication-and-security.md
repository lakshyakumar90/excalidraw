# Authentication and security

## Implemented protections

- Better Auth is centralized in `packages/auth/src/server.ts`; PostgreSQL stores sessions/accounts. Express mounts auth routes before JSON parsing.
- `requireAuth` in `apps/http-server/src/middleware.ts` resolves session from headers and protects scene/library/room route groups.
- Credentialed CORS uses configured web origin. Production cookie settings are in auth server and must be checked alongside the deployed version/environment.
- Room roles (`owner`, `editor`, `viewer`) are checked server-side. Presence tickets are short-lived signed credentials transported in `Sec-WebSocket-Protocol`, not URL query parameters.
- WS upgrade checks origin, ticket, room binding and access before accepting. Membership/role are periodically rechecked; protocol payloads validated and rate limited; binary messages rejected.
- Invite/join secrets are stored as hashes with expiry/revocation metadata. Unique claims and transactions address claim races.
- Express JSON limit is 50 MB. ORM parameterization reduces classic SQL injection risk but does not validate or authorize inputs.

## Environment names only

`DATABASE_URL`, `REDIS_URL`, `WEB_ORIGIN`, `PORT`, `WS_PORT`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `PRESENCE_TICKET_SECRET`, `ROOM_INVITE_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `WS_ALLOWED_ORIGINS`, `REDIS_METRICS_ENABLED`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`, `NEXT_PUBLIC_API_PROXY_PREFIX`, `API_PROXY_TARGET`, `LEGACY_WEB_HOST`, and test-only `TEST_DATABASE_URL`, `REDIS_TEST_URL`. App `.env.example` files describe usage. `NEXT_PUBLIC_*` values reach browsers and must not contain secrets. Service-local DB env takes precedence over workspace `.env`.

No secret values are included. Local `.env` files were not read for this documentation.

## Security review areas

No global HTTP rate limiter is evident in Express mounting; an invitation limiter and WS per-connection budgets exist. Verify Better Auth's built-in throttling, trusted origins, CSRF controls and cookie attributes for the exact deployed configuration. React escaping helps with common XSS vectors but user content still needs safe rendering. No dedicated file scanning/object-storage pipeline is evidenced. Consider route-specific limits, quotas, HTTPS, secret rotation, authorization matrix tests and privacy-safe logs. Dependency vulnerability status was not assessed.

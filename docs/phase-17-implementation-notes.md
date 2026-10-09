# Phase 17: Rooms and invites

## Package boundaries

- `packages/db` owns the Prisma schema, database connection, and room/member/invite/join-code queries and transactions. HTTP routes call the exported database helpers and use the shared Prisma client; they must not open another database connection or add SQLite files under an app.
- `packages/auth` owns signed room-invitation tokens and email delivery. Email tokens are short lived, bound to the invited email, room, role, and invitation record, stored only as a hash, and accepted once. `ROOM_INVITE_SECRET` may be set separately; otherwise the auth secret is used with a purpose-specific derived key.
- `packages/common` owns wire protocol types and role types used by browser, HTTP, and WebSocket packages.
- `packages/backend-common` owns contracts and transport helpers shared by HTTP and WebSocket servers.
- `packages/redis` owns rate-limit and room-access pub/sub operations. Redis messages update open WebSocket connections after membership role changes or revocations.
- `apps/http-server` owns authenticated REST routes and owner-only room management.
- `apps/ws-server` owns presence/collaboration connections and enforces editor/viewer permissions at the connection boundary.
- `apps/web` owns the share, invite, join-code, member-management, and read-only viewer interfaces.

## Access behavior

Rooms are created from scenes owned by the current user. Owners can create editor or viewer email invitations and expiring join codes. Email invitations are signed, tied to a verified matching email, and single-use. Join codes use six characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, are unique while active, reusable by multiple people, and can be revoked or expire. Authenticated users who are not a member need a valid invite; otherwise access is rejected. Auth continuation paths are restricted to local invite/join routes.

Owner controls list members and pending invitations, resend or revoke email invitations, create/revoke join codes, change editor/viewer roles, and remove members. Owners cannot demote or remove themselves. Role changes and removals are broadcast through Redis; connected WebSocket clients update permissions or close immediately. Viewers can load and navigate a room but cannot commit edits through HTTP or WebSocket APIs.

## Runtime configuration

- `DATABASE_URL`: PostgreSQL database managed through `packages/db`.
- `REDIS_URL`: Redis used for invitation throttling, collaboration state, and access-change pub/sub.
- `BETTER_AUTH_SECRET` (or optional `ROOM_INVITE_SECRET`): at least 32 characters for signing invitation links.
- `WEB_ORIGIN`: public web origin used to construct share and invitation links; defaults to `http://localhost:3000` for local development.
- `RESEND_API_KEY` and `EMAIL_FROM`: configure email delivery. When missing, the owner receives a manual invite link in the management UI; the URL is not logged.

Schema changes are represented in `packages/db/src/prisma/contract.prisma` and emitted with `pnpm --filter @repo/db db:emit`. Review `pnpm --filter @repo/db exec prisma db update --dry-run` before applying with `pnpm --filter @repo/db exec prisma db update`; do not hand-write SQL migrations.

## Verification and manual run

Run focused type checks for the changed packages and build the app packages before startup. Do not spend time on broad integration or browser suites for this phase. For manual verification, create/share a room, send an email invitation or copy its manual link, accept as the matching verified user, try an invalid/uninvited join, create and revoke a join code, change a member between editor and viewer, and verify a viewer's edit is rejected by the server. Confirm the web app, HTTP health endpoint, WebSocket service, Redis, and flush worker all start from the workspace scripts.

Use a separate commit for each coherent layer (database/auth, HTTP/Redis enforcement, WebSocket enforcement, web flows, and docs). Keep generated TypeScript build artifacts and personal lockfile changes out of feature commits.

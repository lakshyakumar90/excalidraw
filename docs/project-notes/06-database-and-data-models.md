# Database and data models

## Database boundary

PostgreSQL is durable relational storage (root docs require PostgreSQL 15+). `packages/db/src/prisma/db.ts` loads service-local `.env` before root `.env`, requires `DATABASE_URL`, constructs the Prisma Postgres runtime client from generated contract and a `pg.Pool` for Better Auth. `connectDatabase()` checks both. Apps should consume this package instead of initializing clients. Schema is `packages/db/src/prisma/contract.prisma`; migration graph is `packages/db/migrations/app`, configured by `prisma.config.ts`. Scripts include emit/check/sign/migrate/update; inspect existing schema state before applying migrations.

## Models

| Model | Meaning and constraints |
|---|---|
| `User` | Identity; unique email and optional unique username; owns scenes, library and rooms/memberships; auth records link here. |
| `Scene` | Owner, title, JSONB data, optional room, timestamps and `syncRevision`; indexed `(ownerId, updatedAt)`. |
| `SceneRevision` | Accepted snapshot, actor and revision; unique `(sceneId, revision)`; cascades with scene. |
| `Room` | Unique slug, admin, optional unique linked scene, members/chats/invites/codes. |
| `RoomMember` | User/room role `owner|editor|viewer`; unique `(userId, roomId)`. |
| `Invite`, `JoinCode` | Unique hashed credential, role, expiry/revocation; room index. |
| `InviteClaim`, `JoinCodeClaim` | One-to-one unique claim for accepted/revoked action; transactional membership updates serialize races. |
| `LibraryItem` | Owner/name/JSON payload, indexed `(ownerId, updatedAt)`. |
| `Session`, `Account`, `Verification` | Better Auth user/session/provider persistence. |
| `Chat` | Room/user/message/time; indexes on room and user. No retention policy visible in schema. |

![Entity diagram](diagrams/database-er.mmd)

## Consistency and operations

The schema comments explain that unique `(sceneId, revision)` arbitrates concurrent durable inserts; uniqueness conflicts can prompt retry. Claim rows and membership changes occur in one transaction. Exact repository operations live in `packages/db/src/prisma/{sceneSync,roomAccess,library}.ts`.

Indexes exist for owner/update scene/library queries, unique IDs/slugs/tokens, membership uniqueness, invite lookup, join-code expiry and revision uniqueness. JSONB structure still needs application validation; ORM types do not prove arbitrary stored JSON validity. Inspect query plans before adding indexes. The worker retains recent revisions via `ROOM_SNAPSHOT_KEEP`.

No configured backup/restore procedure, connection-pool sizing policy, partitioning or production retention runbook was evidenced. Prisma does not provide authorization or guarantee efficient SQL. Preserve ownership checks in application/repository logic. Alternative SQL/ORM stacks change typing/migration tradeoffs; non-relational DB migration would change uniqueness, transaction and relational permission patterns.

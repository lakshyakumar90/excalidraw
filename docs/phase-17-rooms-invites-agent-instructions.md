# Phase 17 implementation handoff: rooms and invites

## Scope and completion

Implement Phase 17 end to end, following this plan and applicable `AGENTS.md` files. This is an implementation specification, not a claim that Phase 17 is complete. Baseline inspected: 2026-10-09, after Phase 16.

An owner can share a saved scene, invite an editor or viewer by email or a six-character code, manage access, and revoke invitations. A recipient can sign in and return to the invitation, join, and open the correct room canvas. Viewers can watch the live canvas without editing. Role changes and removal must affect HTTP and WebSocket authorization across instances. Keep Phase 15 synchronization and Phase 16 Redis persistence working.

Deliver in small coherent commits, run the focused checks below, push the intended commits, and leave the whole application running for the user to test. Do not start Phase 18.

## Inspect and reuse the existing implementation

Read these before modifying code:

- `packages/db/src/prisma/contract.prisma`, `db.ts`, `sceneSync.ts`, `prisma.config.ts`, and `packages/db/package.json`.
- `packages/auth/src/server.ts`, `presenceTicket.ts`, and the browser auth client.
- `packages/backend-common/src/collaboration.ts` and `presenceTransport.ts`.
- `packages/common` room roles and collaboration/presence contracts.
- `packages/redis/src/index.ts` and `apps/flush-worker/src/index.ts`.
- `apps/http-server/src/routes/rooms.ts`, owner scene routes, authentication middleware, and their existing tests.
- `apps/ws-server/src/index.ts`, `server.ts`, and `roomStore.ts`.
- `apps/web/src/lib/api/rooms.ts`, `auth.ts`, and authentication forms/hooks.
- `apps/web/src/app/room/[roomId]/page.tsx`, its canvas page, `app/invite/[code]/page.tsx`, and saved-scene canvas pages.
- `CanvasWorkspace`, `RoomPresence`, `useRoomSync`, browser outbox handling, dashboard room controls, and `apps/web/AGENTS.md`.

Existing features to extend:

- `POST /room` checks scene ownership and creates an owner membership in a transaction. A scene already attached to a room currently returns 409.
- `Room`, `RoomMember`, and `Invite` exist. Membership has a unique `(userId, roomId)` constraint and owner/editor/viewer roles.
- Existing invites are email-bound, SHA-256 hashes of 64-character random hex credentials, expire after seven days, and always add editors. Creation returns a copyable link; it does not deliver an invitation email.
- Existing room pages list members/invitations, remove members, and revoke invite records. They do not change roles or generate short join codes.
- The invite page asks logged-out people to sign in and manually return. Fix that journey.
- The room canvas currently excludes viewers and shows “no editable scene.” Implement a real live read-only canvas.
- HTTP room writes deny viewers; WS has role checks, separate message budgets, and periodic membership checks. Reuse these protections.
- WS `currentRole()` currently falls back to a stored role when the lookup returns null or fails. Remove this authorization fallback; revocation and lookup failure must not permit stale editor writes.
- `sceneSync.ts` documents that this pinned ORM implements conditional updates as a read followed by a write. The existing invite `usedAt: null` update is therefore not sufficient evidence of an atomic single-use claim. Fix and verify the claim race.
- Dashboard text still says collaboration arrives in Phase 14. Update stale copy within touched room controls.

Write `docs/architecture/phase-17-decisions.md` with the final invite/code lifecycle, migration choices, authorization behavior, rate limits, verification results, and any real limitations.

## Package responsibilities

| Package/app | Responsibility |
| --- | --- |
| `packages/db` | Existing database initialization/client, Prisma contract and schema workflow, all new room/member/invitation database queries and transactions. |
| `packages/auth` | Existing sessions, server-side identity, purpose-specific invitation signing/verification, safe auth return-path handling, reusable email delivery. |
| `packages/common` | Browser-safe roles, request/response types, access-change protocol types and other contracts shared by frontend/HTTP/WS. |
| `packages/validations` | Extend existing request validators; avoid duplicating their rules in unrelated apps. |
| `packages/backend-common` | Authorization policy and orchestration shared by HTTP/WS, invitation/member services, access-change event handling. |
| `packages/redis` | Redis infrastructure, shared rate-limit primitives and access-invalidation pub/sub transport. |
| `apps/http-server` | Authenticated routes, input validation, status codes, calls to shared services. |
| `apps/ws-server` | Handshake authorization, active socket role enforcement and removal, existing message limits and room fan-out. |
| `apps/web` | Share/access UI, joining/authentication journey, live read-only canvas and role-change UX. |
| `apps/flush-worker` | Preserve its existing persistence responsibility. Invitation work does not belong here. |

Use the exported `db` from `packages/db/src/prisma/db.ts` through `@repo/db`. Do not initialize another database, create `database.db`, add SQLite, issue application raw SQL, or replace the current Prisma runtime. Keep auth secrets, Redis clients and database code out of browser imports. Extend narrowly; do not rewrite unrelated phases.

## 1. Contract and data model

Use additive changes to the existing Prisma contract. Preserve existing rooms, owner memberships, pending invitations, scenes and history. Do not drop/recreate tables or reset the database.

Define these defaults explicitly:

- Email invites: editor or viewer only; seven-day expiry by default; single use; owner may revoke.
- Short codes: editor or viewer only; 24-hour expiry by default; single use by default. A replacement code is generated after consumption or revocation. Multi-use codes and usage counters are outside this phase.
- Plain room links: identify the room; confer no membership.
- Existing members retain their current role when redeeming an invitation. Joining must never downgrade the owner or silently promote a viewer/editor who already has a membership; the owner changes roles through the management API.
- Ownership transfer is outside this phase. Exactly the room admin remains owner; owner membership cannot be removed/downgraded through member APIs.
- Uninvited users get a clear “You need an invitation” rejection. The phase allows rejection instead of a request-access workflow; do not add an unfinished request button.

Extend `Invite` with invited role and revocation/delivery metadata as needed. Add a separate short-code model so public bearer codes are not confused with email-bound signed tokens. Store only credential digests; return raw short codes only on creation. Listing invitations must not reveal usable tokens/codes.

Use a uniqueness constraint for normalized short-code digests across active records and retry collisions a small bounded number of times. It is acceptable to keep digests globally unique across retained records in this phase; prune expired historical records later with a documented retention rule. Index room-scoped listing and token lookup.

Make redemption and revocation mutually exclusive using a database-enforced operation, not a read-then-write boolean check. One suitable design is a terminal-action record with a unique invitation/code ID: a transaction inserts either a redemption or revocation action, and redemption creates the membership in that same transaction. Concurrent inserts cannot both win. Keep authorization, credential validation, expiry checking and membership creation inside the operation's transaction. Another supported concurrency design is acceptable if verified against the pinned Prisma runtime with a real concurrent database check. Do not invent unsupported row-lock APIs or solve this with raw SQL.

Inspect the installed Prisma 8 CLI help and `packages/db/prisma-8.md`; this repository uses `prisma contract emit`, `prisma db migrate`, and package scripts, rather than assuming classic Prisma Client commands. Regenerate `contract.json` and `contract.d.ts` through the supported emitter. Use the supported migration workflow from `packages/db`, review the migration, and verify it is additive before applying. Never hand-edit generated contracts. Configuration must load the existing root/local environment without printing credentials.

Decide how legacy hex links remain redeemable until their original expiry. Prefer a bounded legacy acceptance path; new invitations use the signed-token scheme. Document removal timing rather than silently invalidating existing links.

## 2. Share a scene and create/reuse its room

Add Share to a saved-scene canvas and make room management reachable from a room canvas. For an unsaved local scene, guide the signed-in owner to save it first; do not lose the local drawing.

Share creates a room for the scene or returns its existing owned room. Make repeated clicks/retries idempotent. Concurrent Share requests must resolve the unique scene-room conflict by reading the owned room, not creating duplicates. Preserve the explicit room name flow where already used; do not let globally unique names make sharing an ordinary scene title impossible. Use a unique slug independent of its display name if the model needs that change.

The owner must exist as a member. Return a canonical link built from configured `WEB_ORIGIN`, such as `/room/{id}/canvas`, together with the room ID and owner role. Never build security-sensitive email links from an untrusted Host header. A copied room URL opens the access-check/join journey for outsiders.

Keep existing API clients working while extending `POST /room` or introduce a clearly named share endpoint. Use shared response types and show progress/errors in the Share UI.

## 3. Six-character codes

Generate exactly six uppercase characters with a cryptographically secure generator using `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. This excludes 0/O/1/I. Normalize accepted lowercase input and surrounding whitespace before strict validation; do not normalize different punctuation into valid codes.

Create, redeem, list metadata and revoke codes through authenticated routes. Only the owner can create/revoke. The owner chooses editor or viewer and sees expiry, single-use status and a copy control. Add a code entry route/page and a code-bearing join URL distinct from email invitation routes.

Redeeming a code grants the configured membership only after the user is authenticated and the code is valid, unexpired, unrevoked and unconsumed. Someone holding a valid code is invited; a room ID alone is not. An invalid code returns a generic failure without disclosing room/member details. Apply shared rate limits before expensive lookups, including to failed attempts.

## 4. Signed email invitations and actual delivery

Reuse the existing Resend integration/configuration. Extract reusable delivery into `packages/auth` if it is currently private to signup verification; keep room-specific invitation templates/orchestration in the shared backend service. Use Nodemailer only if the existing project has an explicit SMTP requirement. Do not add a second provider without a reason.

Use a purpose-specific signing key/configuration and claims containing an unpredictable invitation ID/token ID, room ID, normalized recipient email or recipient binding, invited role, expiry, issuer and audience. Verify algorithm, signature, purpose, issuer, audience and expiry. A signature does not replace checking the database for revocation and single-use status. Keep presence tickets and invitation tokens distinct. Store a digest/token identifier rather than the raw signed credential.

Acceptance requires the matching authenticated email and verified ownership of that email through the existing auth flow. An unrelated account gets a clear account-switch option without consuming the invite. Preserve the invitation return path through signup/email verification as well as login and supported OAuth.

Email contains room name, inviter display name, granted role, expiry and the canonical invitation link. Opening the link leads through acceptance directly to the room canvas. Do not consume invites on GET/page render; email security scanners and browser prefetch must not use them. Consume only via an authenticated POST when the recipient joins.

Create the invite durably, then send with a bounded request timeout. Record sent/failed state. Provider acceptance means “sent,” not proven mailbox delivery. On provider failure, show “Invitation created; email could not be sent,” allow a bounded retry, and do not claim success. A resend must not create multiple active credentials accidentally; use provider idempotency if supported or deliberately revoke/replace the prior invitation. Do not log invitation tokens or put them in analytics.

With no configured provider, show an explicit development/manual-link state, following the existing auth development behavior. Never return a success message asserting an email was sent. Actual inbox delivery remains a manual check when provider credentials are available.

## 5. Join and sign-in return flow

Support both existing invitation URLs and the new short-code route. Use one consistent access gate for room page and canvas page:

1. Existing authenticated member: open the canvas with the server role.
2. Authenticated recipient with valid invitation/code: accept with POST, then open the canvas.
3. Authenticated outsider without a usable invitation: show the invitation-required rejection; do not leak scene contents.
4. Logged out: navigate to the existing sign-in UI with a validated relative return path, then resume the original join flow after sign-in/signup/verification/OAuth.
5. Expired, revoked, consumed or malformed credential: explain that a new invitation is needed; avoid infinite redirects and generic “loading” states.

Only accept same-origin relative application destinations for return paths. Reject absolute URLs, protocol-relative paths, encoded bypasses and nonapplication routes. Preserve invitation data only for the authentication journey; do not put it into local scene/outbox storage or expose it as a referrer to third parties. Strip sensitive tokens from navigation/history after successful acceptance where practical.

Make repeated acceptance safe: an existing permitted membership can land on its room without another role change, but a removed user cannot reuse an already consumed invite to regain access. Handle same-account concurrent tabs consistently.

## 6. Read-only canvas and changing authorization

Reuse the same renderer, room sync, remote cursors, viewport, files, participants and selection display for viewers. Add a read-only capability through canvas input handling. Viewers may pan/zoom/select for inspection, and send harmless presence; they cannot create, drag, resize, delete, paste, import, undo/redo scene changes or trigger saves/uploads. Disable keyboard/context-menu/drop paths too. Do not implement a static screenshot as the viewer canvas.

Enforce edit permissions on every HTTP mutation and authoritative WS commit/file operation. Recheck membership/role server-side. Viewer-origin drawing previews must also be denied; otherwise a viewer can inject apparent changes. Validate allowed ephemeral presence separately from drawing previews.

Fix `currentRole()` to deny on absent membership and fail closed on authorization lookup failure. Do not use stale editor status as a fallback. Preserve short-lived handshake tickets, fresh membership validation and origin checks.

On role update/removal, persist the change through the DB package and publish a typed access-change event through existing Redis pub/sub. Every WS instance invalidates that user's room sockets, including multiple tabs. A downgrade updates role/canvas capability immediately; removal closes the room connections and returns the user to an access-denied state. Refresh affected browser room metadata without reloading away pending local edits.

Treat pub/sub as notification, not authority. New joins, HTTP writes and WS committed mutations consult current authorization. Keep a short bounded periodic recheck for active sockets when an event is missed (default target: within five seconds), and close/fail closed when a required authorization lease cannot be renewed. Document the bound for existing sockets during pub/sub failure. Check membership before sending new scene/file data to a socket whose access has been invalidated.

An already accepted authorized commit may finish during removal; future unauthorized edits must not be accepted. On downgrade/removal, stop automatic outbox replay. Retain unresolved local drafts with an accurate explanation; do not turn them into server-saved changes or delete them silently. Previously cached content cannot be remotely erased from an ex-member's device.

Preserve Redis acceptance/persistence watermarks, flush scheduling, initial sync and snapshot history. Membership and invitation changes must not overwrite live room elements or bypass the write-behind worker.

## 7. Manage members and invitations

Extend the existing member/invite panel and expose it from Share. Show participant names, roles, invitations/code expiry, pending/sent/failed/consumed/revoked state, and owner controls.

Add an owner-only role update endpoint for editor/viewer and existing member removal. Reject owner role assignment, owner removal, unknown roles, cross-room targets and changes by editors/viewers. Keep room admin and membership invariants consistent. Show pending controls, confirmation for removal, and recoverable errors; update UI only after confirmed server success.

Owners can revoke email invitations and short codes. Revocation blocks future acceptance and does not remove an already joined member; the Remove action does that. Preserve revoked metadata instead of making management history misleading. Existing editors/viewers can see permitted member display information; expose member emails and invitation details only as needed by the owner management UI.

Suggested route additions, adjusted to the existing router without breaking callers:

| Operation | Auth/policy |
| --- | --- |
| Share/create or reuse scene room | Scene owner |
| `POST /room/:roomId/invites` | Owner; email + editor/viewer |
| `POST /room/invites/:token/accept` | Matching authenticated verified email |
| `POST /room/:roomId/join-codes` | Owner; editor/viewer |
| `POST /room/join-codes/:code/accept` | Authenticated code holder |
| `GET /room/:roomId/join-codes` | Owner; metadata only |
| `DELETE /room/:roomId/join-codes/:id` | Owner |
| `PATCH /room/:roomId/members/:userId` | Owner; editor/viewer |
| Existing list/remove/revoke routes | Preserve and harden existing policy |

Register literal `invites`/`join-codes` routes so dynamic room-ID routes do not intercept them. Keep intentional status semantics: unauthenticated 401, permission denied 403 or existing nondisclosure 404, malformed 400, rate limited 429 with Retry-After, conflict/used credentials a consistent generic response, and service unavailable 503.

## 8. Rate limits

Use the existing Redis package for cross-instance HTTP invitation/code quotas, with atomic increments/expiry and bounded keys. Suggested configurable defaults: ten creations/resends per owner per minute, fifty per room per hour, and ten code/token acceptance attempts per account/IP per minute. Creation and resend share the budget. Record only safe aggregate rate-limit metrics. Trust proxy-derived IPs only when proxy configuration is explicitly correct.

Redis failure must produce a bounded unavailable response for protected invitation operations instead of an unlimited bypass. Return 429 and Retry-After when a quota is exceeded; show useful UI retry state.

Reuse and verify current per-connection WS message budgets and payload limits. Apply a total budget to all messages, including invalid/unknown frames; retain separate committed/ephemeral budgets so cursor traffic does not starve final commits. Consider the per-user aggregate across tabs for inexpensive evasion protection. Repeated abuse may close the socket with a clear policy reason. Do not rate-limit ordinary 33ms cursor/preview updates below their expected combined throughput. Test one representative burst and normal commit/presence traffic; avoid load-testing loops.

## Ordered delivery and Git commits

Inspect existing dirty files first. The handoff baseline had pre-existing modifications to `pnpm-lock.yaml` and `packages/backend-common/tsconfig.tsbuildinfo`; do not assume they belong to Phase 17. Preserve them and inspect provenance before staging. Stage explicit paths/hunks rather than blindly adding everything.

Use the repository branch workflow; create a `codex/` feature branch if appropriate. Do not merge/deploy without separate authorization. Suggested coherent commits:

1. `feat(db): add room invite and join-code lifecycle` — additive contract/migration/generated contracts, DB query helpers and race-safe claim/revoke behavior.
2. `feat(auth): deliver signed single-use room invitations` — purpose-specific token helpers, shared email delivery, return-path support and focused security checks.
3. `feat(rooms): add share join and member management APIs` — services, routes, validation, shared types and Redis invitation quotas.
4. `fix(ws): enforce room access changes across instances` — fail-closed role checks, access events, socket invalidation and message-budget coverage.
5. `feat(web): add sharing invites and live viewer access` — Share/manage/join UI, auth continuation, read-only canvas and capability updates.
6. `docs: record phase 17 verification and local startup` — final decisions, evidence, environment examples and startup instructions.

Adjust slices to keep commits reviewable and logically complete. Do not create empty commits or one giant phase commit. Run affected checks for each completed slice, stage/inspect the intended diff, commit, and push the final series. Preserve actual source migrations/generated Prisma contracts required by the repo; never commit real `.env`, tokens, email addresses from test users, logs, `.next`, Redis data or incidental build artifacts. Do not claim a push succeeded without checking it.

## Basic verification: bounded and useful

Use a small focused verification set. Inspect existing test scripts before running them. Run each affected targeted suite/type check once, then rerun only failures or checks affected by a fix. A stalled command requires diagnosis, not repeated broad test runs. Put a roughly two-minute limit on targeted tests/type checks; startup/build may need a documented longer bound based on observed progress.

Required focused assertions, combined into existing suites where possible:

- Code format, normalization, uniqueness collision retry and expiry; signed token purpose/signature/expiry; safe auth return paths.
- Two concurrent acceptances produce one consumption and one membership; revoke versus acceptance has one valid winner. Verify the concurrency guarantee once against a separate test database using the actual pinned ORM, not only mocks. If no separate DB is available, report that gate explicitly and do not claim race safety was verified.
- Wrong recipient, logged-out acceptance, expired/revoked token and outsider room access are denied; GET does not consume.
- Existing-member redemption preserves the role; owner cannot be removed/downgraded; cross-room targets and nonowner management are denied.
- Viewer HTTP/WS commit and file mutation attempts fail; missing membership/DB authorization failure does not retain editor rights; removal/downgrade affects both tabs/WS instances.
- A representative invite/code rate-limit burst returns 429; ordinary cursor traffic and a final commit still work.
- A compact frontend check covers return-to-invite and at least a drawing shortcut/drop/save denial in viewer mode.

Do one short manual/browser smoke journey with owner, editor and viewer sessions: share a saved scene; join via code; accept an email link after sign-in; observe live drawing as a viewer; change editor to viewer; remove that user; revoke a fresh code; verify denial. Use a local mail capture/manual development link when delivery credentials are unavailable and clearly record that actual email delivery was not tested. Avoid broad browser matrices and exhaustive unrelated canvas tests.

Run one basic end-to-end persistence regression: an authorized edit appears immediately in another client, becomes persisted through the Phase 16 worker, and survives reload. Include one owner/editor/viewer path through two WS instances when validating access-change pub/sub. Use temporary test rooms/scenes; do not reset or delete the user's existing data.

Update the architecture record with actual commands, results and any missing checks. Stop testing once these gates pass; no indefinite test loop.

## Run the whole application and final handoff

Reuse the existing local Redis. Check port owners before starting services; reuse healthy workspace processes and restart only necessary workspace services. Do not kill unrelated Node processes or make WSL mandatory. Confirm the active frontend is running the changed code.

Root `pnpm dev` starts web, HTTP, WS and the standalone flush worker with required package builds. If web is already healthy, start missing backend services with:

```text
pnpm exec turbo run dev --filter=http-server --filter=ws-server --filter=flush-worker
```

Build affected shared packages before starting/restarting dependents, and avoid duplicate watcher/build processes. Changes to package output must not leave servers stuck in restart loops. Use the established root/local environment loading. Add example-only invitation signing/rate-limit settings to `.env.example`; never print real secrets. Check Resend/email configuration without exposing values.

Expected development addresses:

- Web: `http://localhost:3000`.
- HTTP: `http://localhost:5000`; `/health` responds 200.
- WS: `ws://localhost:8080`; authenticated room handshake works, unauthenticated handshake is rejected.
- Redis: user's local instance, normally `redis://127.0.0.1:6379`.
- Flush worker: startup and Redis connection confirmed; an actual authorized room edit flushes successfully.

Leave healthy services running. Final report: implemented behavior, focused verification results, actual email delivery status, commit IDs and pushed branch/PR if applicable, exact URLs and a short owner/editor/viewer test journey. State genuine remaining limitations. A plan, server health check, or mock-only suite is not evidence that all Phase 17 behavior is implemented.

# Phase 14 agent handoff: presence only

Implement Phase 14 end to end, then test and commit it in small, reviewable commits. This file is the task specification for the implementing agent. Read the current code and repository instructions before editing; paths below describe the repository as of 2026-10-09.

## Goal and hard boundary

Two signed-in browsers in the same room can see each other's live cursors, names, avatar presence, and connection status. They can jump to the scene location another participant is viewing. Presence reconnects and re-syncs. **No element data crosses the WebSocket.** Existing scene load/save remains HTTP-based Phase 13 behavior. Do not add element operations, scene snapshots, file/image payloads, chat, or durable collaboration in this phase. Do not write pointer or viewport events to PostgreSQL, IndexedDB, or scene JSON.

An open WebSocket means the **presence channel** is live. Do not imply that scene edits are synchronized or that autosave succeeded. Label connection state accordingly in the UI.

## Repository boundaries

| Package/app               | Owns                                                                                                                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db`             | The Prisma ORM 8 client, PostgreSQL connection setup, schema, migrations, and room/member/user queries. Import its existing `db` from `@repo/db`; do not create a database client or pool in an app.                                                                                                     |
| `packages/auth`           | Better Auth session validation and the short-lived presence-ticket issue/verify logic. Keep signing secrets here, with no hard-coded fallback. Browser auth stays in `@repo/auth/client`.                                                                                                                |
| `packages/common`         | Browser-safe protocol types shared by web, HTTP, and WebSocket code. Put the discriminated message unions and shared payload types here. No Node-only or database imports.                                                                                                                               |
| `packages/backend-common` | Generic code genuinely shared only by HTTP and WebSocket services. Put backend-only transport/config helpers here when both services use them. Auth-specific functions belong in `packages/auth` even though both services call them. Do not keep or reuse the current hard-coded `JWT_SECRET` fallback. |
| `apps/http-server`        | A small credentialed HTTP endpoint that issues a room-scoped presence ticket after checking the Better Auth session and room access. No WebSocket fan-out here.                                                                                                                                          |
| `apps/ws-server`          | The `ws` server, upgrade authentication, authoritative membership check, in-memory room fan-out, heartbeat, and connection cleanup. No scene CRUD.                                                                                                                                                       |
| `apps/web`                | Native browser `WebSocket`, ticket fetch, reconnect, pointer/viewport publishing, remote cursor rendering, avatar stack, and connection indicator.                                                                                                                                                       |

Relevant existing entry points: `apps/ws-server/src/index.ts` currently accepts a JWT in a URL query and only answers `pong`; replace that path. `apps/http-server/src/routes/rooms.ts` shows Phase 13 room authorization. `apps/web/src/app/room/[roomId]/canvas/page.tsx` loads the room scene. `apps/web/src/components/canvas/Canvas.tsx` owns the interactive canvas and viewport. `apps/web/src/lib/persistence/viewportStore.ts` exposes viewport changes. `packages/common/src/index.ts` exports shared types. `docs/architecture/phase-13-decisions.md` documents older cookie-upgrade guidance; update that architecture note to record the ticket flow below and why the latest Phase 14 requirement supersedes it.

## Authentication and handshake

1. The browser calls a new HTTP endpoint such as `POST /room/:roomId/presence-ticket` with credentials. Use the existing Better Auth session through `packages/auth`. The HTTP server checks that the current user owns or belongs to that room through `@repo/db` before issuing a ticket. The caller never supplies a user ID.
2. `packages/auth` signs a JWT valid for roughly 60 seconds, with explicit issuer/audience, expiry, issued-at time, user ID, room ID, and a unique ticket ID. Configure a strong server-side signing secret; fail startup when it is absent or weak. Do not reuse the old `JWT_SECRET` default. Do not store tickets in localStorage or persist them.
3. Open `wss://.../room/:roomId` (or `ws://` locally) using the browser's `WebSocket` API. Carry the ticket in a `Sec-WebSocket-Protocol` value such as `auth.<ticket>` alongside a stable protocol name. Select only the stable protocol as the negotiated protocol. **Do not place a session token or ticket in a URL query.** A room ID in the path is only a routing hint, not authorization.
4. Before calling `handleUpgrade`, the WebSocket server verifies the request `Origin`, ticket signature, issuer/audience, expiry, and room scope; it then checks current room ownership/membership again using `@repo/db`. Reject invalid or unauthorized upgrades with an HTTP error. Do not add the socket to a room first. Do not log the ticket.
5. Fetch a fresh ticket on every reconnect. A ticket proves only the initial handshake: if membership is revoked while connected, close that user's sockets promptly or re-check membership on a bounded interval. Avoid a stale connection retaining access indefinitely.

This ticket flow uses the existing cookie session **only at the HTTP issuance step**. It meets the latest Phase 14 request for a short-lived WebSocket JWT while preserving the older rule against session tokens in query strings.

## Protocol in `packages/common`

Export separate `ClientToServerPresenceMessage` and `ServerToClientPresenceMessage` discriminated unions with a `type` field. Include only presence payloads, for example:

- Client: `pointer.move` with finite scene `x/y`; `viewport.update` with finite scene center `x/y` and bounded zoom; optionally `pointer.leave`.
- Server: `presence.snapshot` with connection IDs, user IDs, display names, and latest ephemeral pointer/viewport; `presence.joined`/`presence.left` or a new full snapshot on each change; `pointer.move`; `viewport.update`; a small error message if needed.

The server assigns connection ID, user ID, display name, and room. Never accept these identity fields from a client message. Use a per-connection ID because one user may open two tabs. Deduplicate by user only in the avatar stack if desired; never delete the first tab's presence when the second tab closes. Do not expose participant email addresses.

Type unions are a compile-time contract. Also validate untrusted JSON at the WebSocket boundary: reject unknown message types, invalid numbers, oversized payloads, and excessive message rates. Set a modest maximum WebSocket payload. Control-frame ping/pong does not need a JSON protocol variant.

## Server behavior

- Keep a simple `Map<roomId, Set<connection>>` (or equivalent per-room map). One entry represents one tab. Add only after auth and membership pass; remove exactly that entry on close, error, or heartbeat timeout; delete empty rooms.
- On join and leave, broadcast the authoritative participant snapshot to all sockets in that room. On fresh connection or reconnect, send the full snapshot immediately so ephemeral state recovers without replay.
- Relay pointer and viewport updates only to other sockets in the same room. Do not relay to another room, write to the database, or forward arbitrary client JSON.
- Use `ws` ping every roughly 20 seconds. Mark sockets alive on pong; terminate those that miss the next heartbeat, then broadcast their departure. Clear timers on shutdown.
- Bound fan-out work and backpressure. Drop stale pointer updates for a slow socket rather than allowing unbounded buffers. Pointer delivery is best effort; there are no durable acknowledgements or element version checks in this presence-only phase.

## Browser behavior and rendering

- Connect only on a room canvas with a validated room ID and authenticated session. Close the socket and cancel timers when unmounting, changing rooms, or signing out.
- Publish local pointer positions as **scene coordinates** using the current viewport transform. Throttle to about one update per 33 ms, including a final update after movement stops if needed. Stop publishing on pointer leave. Publish viewport scene center and zoom when panning/zooming; do not send raw elements.
- Render remote cursors on the interactive layer above shapes, with a cursor arrow and readable name label. Compute screen position from each remote scene point and the **local** viewport on every render. Assign a stable, accessible color by hashing the user ID; two tabs of one user may share a color but retain distinct connection IDs. Remote cursors must never enter the scene store, history, selection, or autosave data.
- Interpolate each cursor's displayed scene point toward its latest target each animation frame, accounting for elapsed time. Do not animate old pointers forever after leave/disconnect. Keep cursor movement smooth through local pan and zoom.
- Place an avatar stack in the top-right without obscuring existing controls. Show a useful name on hover/focus. Clicking a participant with a known viewport should center the local view on that participant's shared **scene center**, optionally adopting a clamped zoom. Handle different browser window sizes. If no viewport is known, disable the jump or explain why.
- Show `connecting`, `live`, `reconnecting`, and `offline` states visibly and accessibly. The label must say this is presence, not saved-scene sync. On unexpected close, refetch a ticket and reconnect with exponential backoff plus jitter and a cap; reset backoff after a stable connection. Restore the snapshot and resume publishing after reconnect. Do not retry authentication failures forever: surface a useful message and stop until session/access changes.
- Keep existing HTTP scene loading and autosave intact. Two users' edits are **not** synchronized in this phase; avoid UI copy that suggests they are.

## Verification before delivery

Run `pnpm check-types`, `pnpm --filter web lint`, `pnpm build`, and relevant existing tests. Add focused tests where behavior is risky, using a real `ws` client against an ephemeral server and a controllable membership/auth fixture. Cover at least: valid join; invalid/expired/wrong-room ticket; nonmember rejection; revoked member; room isolation; two tabs for one user; join/leave snapshots; malformed/oversized message; pointer fan-out without element fields; heartbeat cleanup; reconnect snapshot. Test coordinate conversion, throttle timing, interpolation, and avatar jump with targeted unit/component tests where practical. Do not write tests that merely repeat implementation details.

Perform a manual two-browser check with two distinct signed-in members: both avatars appear; each cursor moves smoothly and stays aligned while the other browser pans/zooms; avatar jump goes to the same scene area; disconnect/reconnect states are visible; closing either tab removes only that tab. Verify a nonmember cannot join and that no element payload appears in WebSocket frames. Record exact commands and any unavailable manual check in the final report.

## Commit and delivery sequence

Keep commits small and coherent; do not land one giant Phase 14 commit. A useful sequence is: (1) shared protocol and ticket/auth helper, (2) HTTP ticket issuance and access tests, (3) WebSocket server room lifecycle and heartbeat, (4) browser connection/reconnect and state, (5) pointer/viewport rendering and avatar UI, (6) focused test fixes and documentation. Adjust boundaries if the code suggests a better split. Run checks as each slice becomes testable. Do not commit `.env`, signing secrets, generated build caches, or temporary test files. Review `git diff --check` and `git status`, then push the finished commits to GitHub and report commit IDs, tests, and any remaining limitations.

Phase 14 is done only when the two-browser presence scenario works end to end and the repository is clean. Do not start element synchronization or Phase 15 work.

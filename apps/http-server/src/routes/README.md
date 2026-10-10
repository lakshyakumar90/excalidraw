# routes

Authenticated HTTP API for scenes, rooms, invites, files, and private library items.

## Files

- `guestImport.test.ts` — focused regression tests.
- `guestImport.ts`
- `library.test.ts` — focused regression tests.
- `library.ts`
- `presenceTicket.test.ts` — focused regression tests.
- `rooms.test.ts` — focused regression tests.
- `roomInvites.ts` — invite, join-code, and member management routes.
- `roomRouteUtils.ts` — shared room authorization, join-code, and rate-limit helpers.
- `rooms.ts`
- `roomSceneSync.test.ts` — focused regression tests.
- `scenes.ts`

## Working here

Keep changes within this folder’s responsibility. Follow the owning app/package README for setup and checks; use shared packages for reusable logic. Do not edit build output or store credentials here.

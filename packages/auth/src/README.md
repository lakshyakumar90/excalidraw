# src

Better Auth configuration, browser auth client, email delivery, and authentication helpers.

## Files

- `client.ts`
- `email.ts` — account verification and password-reset delivery through Resend.
- `email.test.ts` — delivery and provider-error tests using mocked requests.
- `presenceTicket.test.ts` — focused regression tests.
- `presenceTicket.ts`
- `roomInvitation.ts`
- `server.ts`

## Working here

Keep changes within this folder’s responsibility. Follow the owning app/package README for setup and checks; use shared packages for reusable logic. Do not edit build output or store credentials here.

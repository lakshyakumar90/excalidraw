# dashboard

Next.js editor, account dashboard, and room access interface.

## Files

- `AuthField.tsx`
- `AuthPage.tsx` — shared, route-aware sign-in and sign-up page shell.
- `AuthPanel.tsx`
- `InvitationsPanel.tsx` — accepts or rejects pending room invitations from the account inbox.
- `dashboardStyles.ts`
- `GuestDrawingOffer.tsx`
- `RoomsPanel.tsx` — creates a room from a blank canvas or an unshared saved scene.
- `SceneCard.tsx`
- `ScenesPanel.tsx`

## Working here

Keep changes within this folder’s responsibility. Follow the owning app/package README for setup and checks; use shared packages for reusable logic. Do not edit build output or store credentials here.

Dashboard buttons use inline-flex centering through `dashboardStyles.ts`. Keep labels vertically and horizontally centered across loading and disabled states, and keep forms scrollable on short screens.

The invitation inbox polls the authenticated user's pending room invitations and accepts or rejects them through the room API. Keep recipient authorization and invite persistence in the backend/database packages; this panel only presents the pending items and invokes those actions.

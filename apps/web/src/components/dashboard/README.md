# dashboard

Next.js editor, account dashboard, and room access interface.

## Files

- `AuthField.tsx`
- `AuthPanel.tsx`
- `InvitationsPanel.tsx`
- `dashboardStyles.ts`
- `GuestDrawingOffer.tsx`
- `RoomsPanel.tsx`
- `SceneCard.tsx`
- `ScenesPanel.tsx`

## Working here

Keep changes within this folder’s responsibility. Follow the owning app/package README for setup and checks; use shared packages for reusable logic. Do not edit build output or store credentials here.

Dashboard buttons use inline-flex centering through `dashboardStyles.ts`. Keep labels vertically and horizontally centered across loading and disabled states, and keep forms scrollable on short screens.

The invitation inbox polls the authenticated user's pending room invitations and accepts through the room API. Keep recipient authorization and invite persistence in the backend/database packages; this panel only presents and accepts invitations.

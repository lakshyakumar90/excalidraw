# Code structure

Each folder groups one responsibility. Pages compose UI, hooks manage React state,
API modules make requests, and the drawing engine stays independent of React.

## HTTP server

- `apps/http-server/src/index.ts`: validates startup settings, connects through `@repo/db`, and starts listening.
- `apps/http-server/src/app.ts`: configures Express, CORS, and route mounting. The auth handler stays before the JSON body parser.
- `packages/db/src/prisma/db.ts`: owns the Prisma runtime and Better Auth's PostgreSQL pool.
- `packages/auth/src/server.ts`: configures Better Auth, password hashing, username validation, Google, session validation, and verification email delivery.
- `packages/auth/src/client.ts`: configures the browser Better Auth client.
- `apps/http-server/src/routes/rooms.ts`: room reads and creation, including room membership checks.
- `apps/http-server/src/routes/scenes.ts`: scene CRUD and ownership checks.
- `apps/http-server/src/routes/guestImport.ts`: account-scoped, idempotent guest imports. A deterministic scene primary key prevents duplicate requests from creating multiple scenes.
- `apps/http-server/src/middleware.ts`: validates the session before protected routes.

## Dashboard

- `apps/web/src/app/dashboard/page.tsx`: page layout and choice of signed-in or signed-out content.
- `apps/web/src/components/dashboard/AuthPanel.tsx`: signup, sign-in, Google, and email verification UI.
- `apps/web/src/components/dashboard/AuthField.tsx`: the shared labeled form input.
- `apps/web/src/components/dashboard/ScenesPanel.tsx`: account summary and scene cards.
- `apps/web/src/components/dashboard/SceneCard.tsx`: scene link, inline rename form, and delete confirmation with keyboard focus handling.
- `apps/web/src/hooks/dashboard/useSceneActions.ts`: rename/delete requests, title validation, pending state, and recoverable errors.
- `apps/web/src/hooks/dashboard/useDashboardAuth.ts`: signup steps, request state, errors, and verification actions.
- `apps/web/src/hooks/dashboard/useDashboardScenes.ts`: scene loading, creation, and sign-out actions.
- `apps/web/src/components/dashboard/GuestDrawingOffer.tsx`: the signed-in guest save offer, dismissal, and success link.
- `apps/web/src/hooks/dashboard/useGuestImport.ts`: detects the local drawing, checks previous imports, and handles saving.
- `apps/web/src/lib/persistence/guestImport.ts`: reads IndexedDB, packages referenced images and viewport, and fingerprints the drawing. Viewport-only changes do not trigger a second import; drawing changes can be saved as a new scene. The original guest drawing remains untouched.
- `apps/web/src/lib/api/auth.ts`: authentication requests and frontend callback URLs.
- `apps/web/src/lib/api/request.ts`: shared authenticated HTTP requests and response errors.
- `apps/web/src/lib/api/scenes.ts`: scene requests and scene data types.
- `apps/web/src/lib/api/rooms.ts`: room requests.

## Canvas and selection

- `apps/web/src/components/canvas/Canvas.tsx`: canvas surfaces, rendering lifecycle, and pointer gesture coordination.
- `apps/web/src/components/canvas/text/TextEditorOverlay.tsx`: editable text input and caret overlay.
- `apps/web/src/hooks/canvas/useCanvasPersistence.ts`: scene restore and autosave lifecycle.
- `apps/web/src/lib/canvas/keyboard.ts`: canvas shortcuts and zoom keys.
- `apps/web/src/lib/canvas/doubleClick.ts`: double-click text editing and group entry.
- `apps/web/src/lib/canvas/eraserTrail.ts`: fading eraser trail rendering.
- `apps/web/src/lib/canvas/imageAssetCache.ts`: image bitmap loading and disposal.
- `apps/web/src/lib/canvas/contextMenuActions.ts`: dispatches canvas menu actions.
- `apps/web/src/lib/canvas/sampleCanvasColor.ts`: eyedropper pixel sampling.
- `apps/web/src/lib/selection/selectionController.ts`: selection state and gesture coordination.
- `apps/web/src/lib/selection/selectionTransforms.ts`: resize and point movement operations.
- `apps/web/src/lib/selection/boundElements.ts`: movement and text synchronization for bound elements.
- `apps/web/src/lib/selection/elementClipboard.ts`: element cloning, duplicate ID remapping, and clipboard validation.
- `apps/web/src/lib/selection/selectionBounds.ts`: selection bounds and resize handle detection.
- `apps/web/src/lib/tools/toolDefinitions.ts`: shared tool labels and shortcuts used by keyboard, toolbar, and help.

## Checks

Run from the repository root:

```sh
pnpm check-types
pnpm lint
pnpm --filter http-server build
pnpm --filter web build
pnpm --filter @repo/engine exec vitest run
```

The root type check now covers the web app, both servers, the engine, database,
common types, backend common code, and UI package.

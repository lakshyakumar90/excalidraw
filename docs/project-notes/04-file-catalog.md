# Tracked source/configuration file catalog

Generated from `git ls-files apps packages deploy .github`; generated migration snapshots, vendored guidance, dependencies, caches and binary assets are omitted. Descriptions follow module ownership and file names; see the [folder reference](04-folder-and-file-reference.md) for relationships.

| Path | Purpose |
|---|---|
| `.github/workflows/database-migrations.yml` | Build, runtime, test, or deployment configuration |
| `apps/README.md` | Directory ownership/setup notes |
| `apps/flush-worker/README.md` | Directory ownership/setup notes |
| `apps/flush-worker/package.json` | Package dependencies, scripts and metadata |
| `apps/flush-worker/src/README.md` | Directory ownership/setup notes |
| `apps/flush-worker/src/index.ts` | TypeScript implementation; responsibility follows module path |
| `apps/flush-worker/src/maintenance.test.ts` | Automated tests for adjacent module |
| `apps/flush-worker/src/maintenance.ts` | TypeScript implementation; responsibility follows module path |
| `apps/flush-worker/tsconfig.json` | Build, runtime, test, or deployment configuration |
| `apps/http-server/.env.example` | Tracked text/configuration artifact |
| `apps/http-server/README.md` | Directory ownership/setup notes |
| `apps/http-server/global.d.ts` | TypeScript implementation; responsibility follows module path |
| `apps/http-server/output.log` | Tracked text/configuration artifact |
| `apps/http-server/package.json` | Package dependencies, scripts and metadata |
| `apps/http-server/src/README.md` | Directory ownership/setup notes |
| `apps/http-server/src/app.ts` | TypeScript implementation; responsibility follows module path |
| `apps/http-server/src/index.ts` | TypeScript implementation; responsibility follows module path |
| `apps/http-server/src/invitationRateLimit.ts` | TypeScript implementation; responsibility follows module path |
| `apps/http-server/src/middleware.ts` | TypeScript implementation; responsibility follows module path |
| `apps/http-server/src/routes/README.md` | Directory ownership/setup notes |
| `apps/http-server/src/routes/guestImport.test.ts` | Automated tests for adjacent module |
| `apps/http-server/src/routes/guestImport.ts` | TypeScript implementation; responsibility follows module path |
| `apps/http-server/src/routes/library.test.ts` | Automated tests for adjacent module |
| `apps/http-server/src/routes/library.ts` | TypeScript implementation; responsibility follows module path |
| `apps/http-server/src/routes/presenceTicket.test.ts` | Automated tests for adjacent module |
| `apps/http-server/src/routes/roomInvites.ts` | TypeScript implementation; responsibility follows module path |
| `apps/http-server/src/routes/roomLeave.ts` | TypeScript implementation; responsibility follows module path |
| `apps/http-server/src/routes/roomPermissions.test.ts` | Automated tests for adjacent module |
| `apps/http-server/src/routes/roomRouteUtils.ts` | TypeScript implementation; responsibility follows module path |
| `apps/http-server/src/routes/roomSceneSync.test.ts` | Automated tests for adjacent module |
| `apps/http-server/src/routes/rooms.test.ts` | Automated tests for adjacent module |
| `apps/http-server/src/routes/rooms.ts` | TypeScript implementation; responsibility follows module path |
| `apps/http-server/src/routes/scenes.test.ts` | Automated tests for adjacent module |
| `apps/http-server/src/routes/scenes.ts` | TypeScript implementation; responsibility follows module path |
| `apps/http-server/src/services/README.md` | Directory ownership/setup notes |
| `apps/http-server/tsconfig.json` | Build, runtime, test, or deployment configuration |
| `apps/web/.env.example` | Tracked text/configuration artifact |
| `apps/web/.gitignore` | Tracked text/configuration artifact |
| `apps/web/AGENTS.md` | Technical documentation |
| `apps/web/CLAUDE.md` | Technical documentation |
| `apps/web/README.md` | Directory ownership/setup notes |
| `apps/web/eslint.config.mjs` | Build, runtime, test, or deployment configuration |
| `apps/web/next.config.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/package.json` | Package dependencies, scripts and metadata |
| `apps/web/pnpm-lock.yaml` | Build, runtime, test, or deployment configuration |
| `apps/web/postcss.config.mjs` | Build, runtime, test, or deployment configuration |
| `apps/web/public/README.md` | Directory ownership/setup notes |
| `apps/web/src/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/canvas/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/canvas/[sceneId]/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/canvas/[sceneId]/page.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/app/dashboard/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/dashboard/page.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/app/dev/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/dev/renderer-benchmark/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/dev/renderer-benchmark/page.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/app/forgot-password/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/forgot-password/page.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/app/globals.css` | Application styling |
| `apps/web/src/app/invite/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/invite/[code]/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/invite/[code]/page.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/app/join/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/join/[code]/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/join/[code]/page.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/app/layout.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/app/login/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/login/page.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/app/page.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/app/reset-password/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/reset-password/page.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/app/room/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/room/[roomId]/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/room/[roomId]/canvas/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/room/[roomId]/canvas/page.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/app/room/[roomId]/page.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/app/signup/README.md` | Directory ownership/setup notes |
| `apps/web/src/app/signup/page.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/README.md` | Directory ownership/setup notes |
| `apps/web/src/components/account/AccountLink.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/account/PasswordRecovery.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/account/README.md` | Directory ownership/setup notes |
| `apps/web/src/components/canvas/Canvas.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/canvas/CanvasContextMenu.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/canvas/CanvasControls.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/canvas/CanvasDebugHud.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/canvas/CanvasWorkspace.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/canvas/EditorActionsMenu.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/canvas/EditorExtras.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/canvas/HelpDialog.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/canvas/PersonalLibraryPanel.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/canvas/README.md` | Directory ownership/setup notes |
| `apps/web/src/components/canvas/RendererBenchmark.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/canvas/text/README.md` | Directory ownership/setup notes |
| `apps/web/src/components/canvas/text/TextEditorOverlay.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/dashboard/AuthField.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/dashboard/AuthPage.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/dashboard/AuthPanel.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/dashboard/GuestDrawingOffer.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/dashboard/InvitationsPanel.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/dashboard/README.md` | Directory ownership/setup notes |
| `apps/web/src/components/dashboard/RoomsPanel.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/dashboard/SceneCard.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/dashboard/ScenesPanel.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/dashboard/dashboardStyles.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/editor/EditorHeader.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/editor/README.md` | Directory ownership/setup notes |
| `apps/web/src/components/presence/LaserOverlay.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/presence/PresenceAvatars.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/presence/PresenceCursors.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/presence/PresenceStatus.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/presence/README.md` | Directory ownership/setup notes |
| `apps/web/src/components/presence/RemotePreviews.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/presence/RemoteSelections.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/presence/RoomHeaderStatus.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/presence/RoomPresence.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/presence/SyncStatus.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/rooms/JoinCodePage.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/rooms/README.md` | Directory ownership/setup notes |
| `apps/web/src/components/rooms/RoomActions.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/scene/README.md` | Directory ownership/setup notes |
| `apps/web/src/components/scene/SceneDebug.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/styles/ColorPicker.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/styles/EyedropperOverlay.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/styles/README.md` | Directory ownership/setup notes |
| `apps/web/src/components/styles/StyleFields.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/styles/StylePanel.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/toolbar/FileMenu.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/toolbar/README.md` | Directory ownership/setup notes |
| `apps/web/src/components/toolbar/ToolButton.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/toolbar/ToolIcon.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/components/toolbar/Toolbar.tsx` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/hooks/README.md` | Directory ownership/setup notes |
| `apps/web/src/hooks/canvas/README.md` | Directory ownership/setup notes |
| `apps/web/src/hooks/canvas/useCanvasInteraction.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/hooks/canvas/useCanvasPersistence.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/hooks/dashboard/README.md` | Directory ownership/setup notes |
| `apps/web/src/hooks/dashboard/useDashboardAuth.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/hooks/dashboard/useDashboardScenes.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/hooks/dashboard/useGuestImport.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/hooks/dashboard/useSceneActions.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/hooks/sync/README.md` | Directory ownership/setup notes |
| `apps/web/src/hooks/sync/useRoomSync.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/README.md` | Directory ownership/setup notes |
| `apps/web/src/lib/api/README.md` | Directory ownership/setup notes |
| `apps/web/src/lib/api/auth.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/api/request.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/api/rooms.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/api/scenes.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/canvas/README.md` | Directory ownership/setup notes |
| `apps/web/src/lib/canvas/contextMenuActions.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/canvas/doubleClick.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/canvas/eraserTrail.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/canvas/imageAssetCache.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/canvas/input/README.md` | Directory ownership/setup notes |
| `apps/web/src/lib/canvas/input/touchNavigation.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/canvas/keyboard.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/canvas/layoutActions.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/canvas/renderDiagnostics.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/canvas/sampleCanvasColor.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/canvas/selectionOverlay.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/canvas/sizeCanvas.test.ts` | Automated tests for adjacent module |
| `apps/web/src/lib/canvas/sizeCanvas.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/canvas/types.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/errors.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/history/README.md` | Directory ownership/setup notes |
| `apps/web/src/lib/history/historyStore.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/persistence/README.md` | Directory ownership/setup notes |
| `apps/web/src/lib/persistence/autosave.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/persistence/excalidrawFile.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/persistence/guestImport.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/persistence/imageFiles.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/persistence/importDocument.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/persistence/indexedDb.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/persistence/library.test.ts` | Automated tests for adjacent module |
| `apps/web/src/lib/persistence/library.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/persistence/rasterExport.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/persistence/roomDraft.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/persistence/savedScene.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/persistence/svgExport.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/persistence/viewportStore.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/presence/README.md` | Directory ownership/setup notes |
| `apps/web/src/lib/presence/avatars.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/presence/colors.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/presence/follow.test.ts` | Automated tests for adjacent module |
| `apps/web/src/lib/presence/follow.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/presence/helpers.test.ts` | Automated tests for adjacent module |
| `apps/web/src/lib/presence/interpolation.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/presence/laser.test.ts` | Automated tests for adjacent module |
| `apps/web/src/lib/presence/laser.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/presence/presencePublisher.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/presence/presenceSocket.test.ts` | Automated tests for adjacent module |
| `apps/web/src/lib/presence/presenceSocket.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/presence/throttle.test.ts` | Automated tests for adjacent module |
| `apps/web/src/lib/presence/throttle.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/presence/viewportJump.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/scene/README.md` | Directory ownership/setup notes |
| `apps/web/src/lib/scene/scene.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/scene/useScene.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/selection/README.md` | Directory ownership/setup notes |
| `apps/web/src/lib/selection/arrowBinding.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/selection/boundElements.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/selection/elementClipboard.test.ts` | Automated tests for adjacent module |
| `apps/web/src/lib/selection/elementClipboard.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/selection/handles.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/selection/resize.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/selection/selectionBounds.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/selection/selectionController.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/selection/selectionStore.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/selection/selectionTransforms.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/styles/README.md` | Directory ownership/setup notes |
| `apps/web/src/lib/styles/colorHistoryStore.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/styles/eyedropperStore.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/styles/snappingPreference.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/styles/styleStore.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/sync/README.md` | Directory ownership/setup notes |
| `apps/web/src/lib/sync/commits.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/sync/outbox.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/sync/previewGeometry.test.ts` | Automated tests for adjacent module |
| `apps/web/src/lib/sync/previewGeometry.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/sync/reconciliation.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/sync/roomFiles.test.ts` | Automated tests for adjacent module |
| `apps/web/src/lib/sync/roomFiles.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/sync/roomSync.test.ts` | Automated tests for adjacent module |
| `apps/web/src/lib/sync/roomSync.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/sync/syncBridge.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/sync/syncPreview.test.ts` | Automated tests for adjacent module |
| `apps/web/src/lib/tools/README.md` | Directory ownership/setup notes |
| `apps/web/src/lib/tools/toolDefinitions.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/lib/tools/toolManager.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/src/styles/README.md` | Directory ownership/setup notes |
| `apps/web/src/styles/dashboard.css` | Application styling |
| `apps/web/src/styles/editor.css` | Application styling |
| `apps/web/src/types/README.md` | Directory ownership/setup notes |
| `apps/web/src/types/canvas/README.md` | Directory ownership/setup notes |
| `apps/web/src/types/canvas/types.ts` | TypeScript implementation; responsibility follows module path |
| `apps/web/tsconfig.json` | Build, runtime, test, or deployment configuration |
| `apps/web/vitest.config.ts` | TypeScript implementation; responsibility follows module path |
| `apps/ws-server/.env.example` | Tracked text/configuration artifact |
| `apps/ws-server/README.md` | Directory ownership/setup notes |
| `apps/ws-server/package.json` | Package dependencies, scripts and metadata |
| `apps/ws-server/src/README.md` | Directory ownership/setup notes |
| `apps/ws-server/src/collab.test.ts` | Automated tests for adjacent module |
| `apps/ws-server/src/index.ts` | TypeScript implementation; responsibility follows module path |
| `apps/ws-server/src/roomStore.test.ts` | Automated tests for adjacent module |
| `apps/ws-server/src/roomStore.ts` | TypeScript implementation; responsibility follows module path |
| `apps/ws-server/src/server.test.ts` | Automated tests for adjacent module |
| `apps/ws-server/src/server.ts` | TypeScript implementation; responsibility follows module path |
| `apps/ws-server/tsconfig.json` | Build, runtime, test, or deployment configuration |
| `deploy/ec2/Caddyfile` | Build, runtime, test, or deployment configuration |
| `deploy/ec2/bootstrap.sh` | Build, runtime, test, or deployment configuration |
| `packages/README.md` | Directory ownership/setup notes |
| `packages/auth/README.md` | Directory ownership/setup notes |
| `packages/auth/package.json` | Package dependencies, scripts and metadata |
| `packages/auth/src/README.md` | Directory ownership/setup notes |
| `packages/auth/src/client.ts` | TypeScript implementation; responsibility follows module path |
| `packages/auth/src/email.test.ts` | Automated tests for adjacent module |
| `packages/auth/src/email.ts` | TypeScript implementation; responsibility follows module path |
| `packages/auth/src/presenceTicket.test.ts` | Automated tests for adjacent module |
| `packages/auth/src/presenceTicket.ts` | TypeScript implementation; responsibility follows module path |
| `packages/auth/src/roomInvitation.ts` | TypeScript implementation; responsibility follows module path |
| `packages/auth/src/server.ts` | TypeScript implementation; responsibility follows module path |
| `packages/auth/tsconfig.json` | Build, runtime, test, or deployment configuration |
| `packages/auth/vitest.config.ts` | TypeScript implementation; responsibility follows module path |
| `packages/backend-common/README.md` | Directory ownership/setup notes |
| `packages/backend-common/package.json` | Package dependencies, scripts and metadata |
| `packages/backend-common/src/README.md` | Directory ownership/setup notes |
| `packages/backend-common/src/collaboration.integration.test.ts` | Automated tests for adjacent module |
| `packages/backend-common/src/collaboration.test.ts` | Automated tests for adjacent module |
| `packages/backend-common/src/collaboration.ts` | TypeScript implementation; responsibility follows module path |
| `packages/backend-common/src/index.ts` | TypeScript implementation; responsibility follows module path |
| `packages/backend-common/src/presenceTransport.test.ts` | Automated tests for adjacent module |
| `packages/backend-common/src/presenceTransport.ts` | TypeScript implementation; responsibility follows module path |
| `packages/backend-common/tsconfig.json` | Build, runtime, test, or deployment configuration |
| `packages/backend-common/vitest.config.ts` | TypeScript implementation; responsibility follows module path |
| `packages/backend-common/vitest.setup.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/README.md` | Directory ownership/setup notes |
| `packages/common/package.json` | Package dependencies, scripts and metadata |
| `packages/common/src/README.md` | Directory ownership/setup notes |
| `packages/common/src/collab.test.ts` | Automated tests for adjacent module |
| `packages/common/src/collab.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/src/collabProtocol.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/src/collabValidation.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/src/constants.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/src/element/README.md` | Directory ownership/setup notes |
| `packages/common/src/element/index.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/src/element/types.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/src/index.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/src/laser.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/src/library.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/src/phase19.test.ts` | Automated tests for adjacent module |
| `packages/common/src/presence.test.ts` | Automated tests for adjacent module |
| `packages/common/src/presence.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/src/snapshotChunks.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/src/sync.test.ts` | Automated tests for adjacent module |
| `packages/common/src/sync.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/src/syncValidate.test.ts` | Automated tests for adjacent module |
| `packages/common/src/syncValidate.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/src/types.ts` | TypeScript implementation; responsibility follows module path |
| `packages/common/tsconfig.json` | Build, runtime, test, or deployment configuration |
| `packages/common/vitest.config.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/SKILL.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/build.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/contract.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/debug.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/feedback.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/migration-model.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/migration-review.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/migrations.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/queries-mongo.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/queries-postgres.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/queries.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/quickstart.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/runtime.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/supabase.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/upgrade-app.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/references/upgrade-extension.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.10-to-0.11/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.11-to-0.12/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.11-to-0.12/re-emit-closed-mongo-contracts.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.11-to-0.12/re-emit-domain-namespaced-contracts.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.11-to-0.12/re-emit-postgres-public-default.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.11-to-0.12/strip-migration-labels-hints.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.12-to-0.13/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.12-to-0.13/re-emit-mti-variant-link-columns.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.13-to-0.14/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.13-to-0.14/migration-op-factories-to-methods.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.13-to-0.14/uuid-preset-rename.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.14-to-0.15/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.15-to-0.16/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.16-to-0.17/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.16-to-0.17/strip-sha256-hash-prefixes.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.17-to-8.0.0-rc.1/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.7-to-0.8/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.8-to-0.9/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.8-to-0.9/strip-inline-contracts.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.9-to-0.10/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/0.9-to-0.10/stamp-storage-types-kind.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/8.0.0-rc.1-to-8.0.0-rc.2/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/8.0.0-rc.10-to-8.0.0-rc.11/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/8.0.0-rc.2-to-8.0.0-rc.3/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/8.0.0-rc.3-to-8.0.0-rc.4/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/8.0.0-rc.4-to-8.0.0-rc.5/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/8.0.0-rc.5-to-8.0.0-rc.6/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/8.0.0-rc.6-to-8.0.0-rc.7/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/8.0.0-rc.7-to-8.0.0-rc.8/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/8.0.0-rc.8-to-8.0.0-rc.9/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/app/upgrades/8.0.0-rc.9-to-8.0.0-rc.10/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.10-to-0.11/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.11-to-0.12/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.11-to-0.12/migrate-contract-testing-imports.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.11-to-0.12/regenerate-extension-public-baseline.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.11-to-0.12/strip-migration-labels-hints.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.12-to-0.13/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.13-to-0.14/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.13-to-0.14/migration-op-factories-to-methods.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.13-to-0.14/uuid-preset-rename.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.14-to-0.15/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.15-to-0.16/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.16-to-0.17/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.16-to-0.17/strip-sha256-hash-prefixes.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.17-to-8.0.0-rc.1/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.7-to-0.8/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.8-to-0.9/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.8-to-0.9/strip-inline-contracts.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.9-to-0.10/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/0.9-to-0.10/stamp-storage-types-kind.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/8.0.0-rc.1-to-8.0.0-rc.2/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/8.0.0-rc.10-to-8.0.0-rc.11/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/8.0.0-rc.2-to-8.0.0-rc.3/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/8.0.0-rc.3-to-8.0.0-rc.4/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/8.0.0-rc.4-to-8.0.0-rc.5/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/8.0.0-rc.5-to-8.0.0-rc.6/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/8.0.0-rc.6-to-8.0.0-rc.7/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/8.0.0-rc.7-to-8.0.0-rc.8/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/8.0.0-rc.8-to-8.0.0-rc.9/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-8/upgrading/extension/upgrades/8.0.0-rc.9-to-8.0.0-rc.10/instructions.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-composer-core-concepts/SKILL.md` | Technical documentation |
| `packages/db/.claude/skills/prisma-platform-core-concepts/SKILL.md` | Technical documentation |
| `packages/db/.env.example` | Tracked text/configuration artifact |
| `packages/db/.gitattributes` | Tracked text/configuration artifact |
| `packages/db/.gitignore` | Tracked text/configuration artifact |
| `packages/db/README.md` | Directory ownership/setup notes |
| `packages/db/migrations/app/20261007T1106_baseline/migration.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261007T1106_baseline/migration.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/migrations/app/20261007T1106_baseline/ops.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261007T1107_phase13_scene_schema/migration.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261007T1107_phase13_scene_schema/migration.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/migrations/app/20261007T1107_phase13_scene_schema/ops.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261007T1137_better_auth/migration.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261007T1137_better_auth/migration.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/migrations/app/20261007T1137_better_auth/ops.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261008T0843_unique_usernames/migration.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261008T0843_unique_usernames/migration.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/migrations/app/20261008T0843_unique_usernames/ops.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261009T0859_migration/migration.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261009T0859_migration/migration.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/migrations/app/20261009T0859_migration/ops.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261009T0922_migration/migration.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261009T0922_migration/migration.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/migrations/app/20261009T0922_migration/ops.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261009T1720_phase17_access_schema/migration.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261009T1720_phase17_access_schema/migration.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/migrations/app/20261009T1720_phase17_access_schema/ops.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261009T1722_phase19_personal_library/migration.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/20261009T1722_phase19_personal_library/migration.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/migrations/app/20261009T1722_phase19_personal_library/ops.json` | Build, runtime, test, or deployment configuration |
| `packages/db/migrations/app/refs/db.json` | Build, runtime, test, or deployment configuration |
| `packages/db/package.json` | Package dependencies, scripts and metadata |
| `packages/db/prisma-8.md` | Technical documentation |
| `packages/db/prisma.config.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/src/README.md` | Directory ownership/setup notes |
| `packages/db/src/prisma/README.md` | Directory ownership/setup notes |
| `packages/db/src/prisma/contract.d.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/src/prisma/contract.json` | Build, runtime, test, or deployment configuration |
| `packages/db/src/prisma/contract.prisma` | Database schema/contract |
| `packages/db/src/prisma/db.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/src/prisma/library.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/src/prisma/roomAccess.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/src/prisma/sceneSync.ts` | TypeScript implementation; responsibility follows module path |
| `packages/db/tsconfig.build.json` | Build, runtime, test, or deployment configuration |
| `packages/db/tsconfig.json` | Build, runtime, test, or deployment configuration |
| `packages/engine/README.md` | Directory ownership/setup notes |
| `packages/engine/package.json` | Package dependencies, scripts and metadata |
| `packages/engine/src/README.md` | Directory ownership/setup notes |
| `packages/engine/src/element/README.md` | Directory ownership/setup notes |
| `packages/engine/src/element/factory.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/element/factory.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/element/index.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/README.md` | Directory ownership/setup notes |
| `packages/engine/src/geometry/arrow.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/geometry/arrow.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/binding.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/bounds.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/geometry/bounds.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/curve.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/geometry/curve.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/element.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/elementBounds.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/geometry/elementBounds.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/elementCorners.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/geometry/elementCorners.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/elementLocalBounds.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/hitTest.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/imageHitTest.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/geometry/index.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/line.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/geometry/line.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/polyline.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/geometry/polyline.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/pressure.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/geometry/pressure.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/rotation.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/geometry/rotation.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/shapes.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/simplify.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/geometry/simplify.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/stroke.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/geometry/stroke.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/strokeOutline.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/geometry/strokeOutline.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/geometry/viewport.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/geometry/viewport.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/index.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/README.md` | Directory ownership/setup notes |
| `packages/engine/src/renderer/benchmark.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/renderer/benchmark.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/bitmapRendering.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/culling.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/renderer/culling.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/drawConnectors.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/drawElements.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/drawPaths.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/drawText.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/drawTransform.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/elementBitmapCache.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/renderer/elementBitmapCache.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/index.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/renderLoop.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/renderer/renderLoop.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/renderState.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/renderer.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/sketch/README.md` | Directory ownership/setup notes |
| `packages/engine/src/renderer/sketch/canvasPath.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/sketch/geometry.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/renderer/sketch/geometry.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/sketch/index.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/sketch/prng.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/renderer/sketch/prng.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/sketch/settings.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/svgRenderer.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/renderer/svgRenderer.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/renderer/viewport.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/renderer/viewport.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/scene/README.md` | Directory ownership/setup notes |
| `packages/engine/src/scene/commit.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/scene/history.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/scene/history.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/scene/index.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/scene/layout.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/scene/phase19.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/scene/previews.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/scene/previews.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/scene/records.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/scene/scene.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/scene/scene.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/text/README.md` | Directory ownership/setup notes |
| `packages/engine/src/text/index.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/text/measureText.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/text/measureText.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/tools/ArrowTool.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/tools/CurvedLineTool.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/tools/CurvedLineTool.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/tools/DiamondTool.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/tools/EllipseTool.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/tools/FrameTool.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/tools/FreedrawTool.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/tools/FreedrawTool.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/tools/LineTool.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/tools/LineTool.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/tools/MultiPointLineTool.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/tools/MultiPointLineTool.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/tools/README.md` | Directory ownership/setup notes |
| `packages/engine/src/tools/RectangleTool.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/tools/RectangleTool.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/tools/ShapeTool.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/tools/Tool.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/tools/ToolManager.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/tools/ToolManager.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/tools/index.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/utils/README.md` | Directory ownership/setup notes |
| `packages/engine/src/utils/clamp.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/viewport/README.md` | Directory ownership/setup notes |
| `packages/engine/src/viewport/index.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/viewport/touch.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/src/viewport/viewport.test.ts` | Automated tests for adjacent module |
| `packages/engine/src/viewport/viewport.ts` | TypeScript implementation; responsibility follows module path |
| `packages/engine/tsconfig.json` | Build, runtime, test, or deployment configuration |
| `packages/eslint-config/README.md` | Directory ownership/setup notes |
| `packages/eslint-config/base.js` | Build, runtime, test, or deployment configuration |
| `packages/eslint-config/next.js` | Build, runtime, test, or deployment configuration |
| `packages/eslint-config/package.json` | Package dependencies, scripts and metadata |
| `packages/eslint-config/react-internal.js` | Build, runtime, test, or deployment configuration |
| `packages/redis/README.md` | Directory ownership/setup notes |
| `packages/redis/package.json` | Package dependencies, scripts and metadata |
| `packages/redis/src/README.md` | Directory ownership/setup notes |
| `packages/redis/src/index.test.ts` | Automated tests for adjacent module |
| `packages/redis/src/index.ts` | TypeScript implementation; responsibility follows module path |
| `packages/redis/tsconfig.json` | Build, runtime, test, or deployment configuration |
| `packages/typescript-config/README.md` | Directory ownership/setup notes |
| `packages/typescript-config/base.json` | Build, runtime, test, or deployment configuration |
| `packages/typescript-config/nextjs.json` | Build, runtime, test, or deployment configuration |
| `packages/typescript-config/package.json` | Package dependencies, scripts and metadata |
| `packages/typescript-config/react-library.json` | Build, runtime, test, or deployment configuration |
| `packages/ui/README.md` | Directory ownership/setup notes |
| `packages/ui/eslint.config.mjs` | Build, runtime, test, or deployment configuration |
| `packages/ui/package.json` | Package dependencies, scripts and metadata |
| `packages/ui/src/README.md` | Directory ownership/setup notes |
| `packages/ui/src/button.tsx` | TypeScript implementation; responsibility follows module path |
| `packages/ui/src/card.tsx` | TypeScript implementation; responsibility follows module path |
| `packages/ui/src/code.tsx` | TypeScript implementation; responsibility follows module path |
| `packages/ui/tsconfig.json` | Build, runtime, test, or deployment configuration |
| `packages/validations/README.md` | Directory ownership/setup notes |
| `packages/validations/package.json` | Package dependencies, scripts and metadata |
| `packages/validations/src/README.md` | Directory ownership/setup notes |
| `packages/validations/src/types.ts` | TypeScript implementation; responsibility follows module path |

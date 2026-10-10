# UI consistency and compact-layout implementation plan

Status: implementation in progress. The user has requested implementation. The established design files remain the source of truth; verify the acceptance criteria before marking complete.

Implemented so far: extracted `ToolButton`, `EditorActionsMenu`, and `PersonalLibraryPanel`; replaced the permanent action strip with a bottom-dock menu; centered the compact tool picker; moved editor responsive rules into `apps/web/src/styles/editor.css`; centered account links and dashboard button labels; tightened the auth card spacing. Final checks and remaining decomposition work are still pending.

## Objective

Refine the existing editor and account UI using [DESIGN.md](../DESIGN.md). Preserve Geist Mono and all application behavior. Remove excessive spacing and scattered chrome, center compact drawing controls, anchor a consistent bottom dock, and make compact panels deliberate and usable.

## Evidence and current issues

The current editor was inspected in the browser and in source. Body typography resolves to Geist Mono. The desktop canvas has separate top tools, bottom-left zoom/history, a floating bottom-right five-action strip, and a separate help button. AccountLink sets compact minimum height without flex/grid centering. The compact tool toggle uses left positioning. Global CSS has multiple overlapping compact-screen blocks.

These rules explain the reported visual imbalance. The upper-left development badge visible in local screenshots must not be confused with a product back button; nevertheless, real scene navigation/back controls need a reserved header slot and collision checks.

## Required result

1. One explicit editor header with left navigation, centered tools, and right account controls.
2. One bottom-anchored dock with consistent controls; secondary features move into a clearly labelled menu.
3. Compact active-tool picker centered at 320px, 390px, tablet, and 1024px widths.
4. Styles and feature panels closed initially on compact devices, presented as bounded drawers/sheets with internal scrolling.
5. Centered Sign in/Account/My scenes labels with consistent hit areas and loading states.
6. Compact dashboard/auth spacing, stable typography, readable forms, and page scrolling.
7. Smaller files organized by responsibility rather than another large umbrella component or hook.

## Scope boundaries

- No new collaboration phase, database migration, authentication redesign, room authorization change, or server persistence behavior change is needed for the visual work.
- Keep Prisma operations in db, auth in auth, cross-platform protocol types in common, and server-only reuse in backend-common.
- Do not move frontend layout hooks into common/backend-common to satisfy a file-size goal. Browser-only orchestration belongs in web; reusable UI primitives may belong in ui if genuinely shared.
- Never reset guest IndexedDB, room drafts, outbox, scene coordinates, image files, selection, or saved viewport to make a screenshot look centered.
- Preserve viewer permissions, keyboard shortcuts, import/export, history, binding, frames, library, follow, laser, touch handling, and accessibility.
- Do not merge/delete phase branches again; they are already integrated. Future work should use a new codex/ branch and normal small commits.

## Implementation sequence

### 1. Establish the reusable control layer

Targets: globals.css, dashboardStyles.ts, AccountLink.tsx, Toolbar.tsx, CanvasControls.tsx, StyleFields.tsx.

- Extract semantic color, spacing, radius, control-height, focus, and elevation tokens from the incumbent UI. Keep document colors independent.
- Add shared Button/IconButton, PanelHeader, and grouped-control surface primitives. Prefer web-local components initially; promote to packages/ui only with a real second consumer and correct package exports.
- Use center alignment and explicit control height for links styled as buttons. Fix AccountLink and dashboard submit controls through the shared primitive.
- Replace repeated control classes gradually. Avoid changing every component at once.
- Remove conflicting global responsive overrides only after their consumers use the new layout rules.

Acceptance: centered labels at 320/390/1024/desktop widths, consistent top/bottom control silhouettes, readable disabled/loading states, and 44px touch regions.

Commit: `refactor(ui): establish shared controls and visual tokens`.

### 2. Recompose editor chrome

Targets: CanvasWorkspace.tsx, Toolbar.tsx, CanvasControls.tsx, EditorExtras.tsx, AccountLink.tsx.

Proposed files:

- components/editor/EditorChrome.tsx — header/dock/panel composition.
- components/editor/EditorHeader.tsx — navigation, tools, account slots.
- components/editor/EditorDock.tsx — zoom/history/secondary entry point.
- components/editor/EditorActionsMenu.tsx — discoverable secondary features.
- components/toolbar/ToolButton.tsx and ToolPalette.tsx — render a shared tool model.
- lib/editor/actions.ts — UI action metadata and permission filtering; keep handlers in feature modules.
- styles/editor.css — one responsive chrome layout layer, imported by globals.

Keep CanvasWorkspace small. Use grid slots for the header and one anchor for the bottom dock. Place the compact tool trigger centrally rather than offset to the left. Its palette wraps into balanced rows without scrolling horizontally.

Move Find, Library, Arrange, Elements, Zen, and Help into the secondary menu; preserve their shortcuts and explicit labels. Keep zoom/history prominent. Do not duplicate commands across top and bottom just to make them look identical. At 320px, use compact icons/menu disclosure rather than shrinking text and hit targets.

Acceptance: no header collisions, no permanent floating five-button strip, one bottom dock, and all existing actions reachable within one menu opening. Test guest, saved-scene, shared-room, viewer, access-removed, and following chrome states.

Commit: `feat(editor): unify centered tools and bottom dock`.

### 3. Unify panel behavior and mobile presentation

Targets: StylePanel.tsx, EditorExtras.tsx, HelpDialog.tsx, FileMenu.tsx, RoomPresence.tsx, CanvasWorkspace.tsx.

Proposed files:

- hooks/editor/useEditorPanels.ts — active compact surface, open/close, trigger/focus restoration.
- components/editor/InspectorPanel.tsx and EditorSheet.tsx — desktop/compact presentation.
- components/editor/panels/SearchPanel.tsx, LibraryPanel.tsx, ArrangePanel.tsx, ElementsPanel.tsx.
- hooks/editor/usePersonalLibrary.ts — library requests, pagination, cancellation, error/loading state, permission recheck.
- hooks/styles/useStyleSelection.ts — style/selection subscription and mutation wiring.

Replace loosely coordinated window events with a scoped controller where practical. Never store protocol state in that controller. On compact screens, tool palettes and secondary panels are mutually exclusive. Palette selection leaves styles closed unless the user explicitly opened them.

Anchor mobile sheets above the dock, bound their height to the actual available viewport, and keep a small header/close control visible while content scrolls. Desktop inspector target is 256px. Avoid arbitrary top/bottom offsets accumulating across components.

File/export menus must stay inside the viewport and outside clipping ancestors. Close on Escape and restore focus. Do not trap focus in ordinary non-modal inspectors. Ignore stale responses after account changes or panel dismissal and clear loading state when a request is canceled.

Acceptance: no menu/panel overlaps; close/trigger always reachable; mobile landscape and virtual-keyboard scenarios preserve scrolling; viewer mutation controls remain disabled server-side and client-side.

Commit: `feat(editor): add coordinated inspectors and compact sheets`.

### 4. Refine dashboard and account surfaces

Targets: dashboard/page.tsx, AuthPanel.tsx, AuthField.tsx, ScenesPanel.tsx, SceneCard.tsx, RoomsPanel.tsx, account/room/join pages.

- Reuse the shared button/form primitives and current font.
- Tighten heading-to-content, form-row, card, and section spacing using the defined scale.
- Keep forms centered horizontally, capped in width, and scrollable vertically. Do not vertically center long forms into clipped layouts.
- Align action groups and give long scene titles, room names, emails, errors, and user labels a wrapping strategy.
- Preserve verification pending/resend, signup steps, server errors, loading, empty, scene rename/delete, and room invite flows.

Acceptance: Sign in is centered inside its surface; no horizontal overflow; form submit/mode-switch reachable at short heights; dashboard controls retain a clear hierarchy and do not gain decorative filler.

Commit: `fix(account): compact forms and dashboard layout`.

### 5. Finish the large-file decomposition

Current source audit (approximate line counts; generated declarations excluded):

| File                            | Lines | Extraction boundaries                                                                       |
| ------------------------------- | ----: | ------------------------------------------------------------------------------------------- |
| useCanvasInteraction.ts         |  1206 | render-loop lifecycle, pointer gesture routing, erasing, image-cache wiring                 |
| roomSync.ts                     |  1125 | snapshot assembly, preview/selection channel, outbox delivery/retry, lifecycle coordination |
| selectionController.ts          |  1062 | selection hit/group logic, transform gestures, clipboard commands, selection drawing        |
| ws-server/server.ts             |   905 | handshake authentication, message dispatch, heartbeat/access recheck, Redis bridge          |
| http-server/routes/rooms.ts     |   859 | invite/code routes, access requests, member management, route validators                    |
| engine/scene/scene.ts           |   661 | capture bookkeeping, local mutations, remote reconciliation/order operations                |
| backend-common/collaboration.ts |   605 | file attachment operations and durable/live scene authority helpers                         |
| engine/renderer/drawElements.ts |   570 | linear/freehand/text/shape renderers with shared transforms                                 |
| EditorExtras.tsx                |   564 | feature panels and library state as described above                                         |

Perform the UI-related extractions while recomposing chrome. Make backend/state-machine extractions separate behavior-preserving commits after the UI work. Do not mix an authorization or reconciliation redesign into a file move.

Guidelines:

- Aim for components around 150–250 lines and focused helpers around 100–300 where natural. These are review signals, not hard limits.
- A larger state machine may retain its coordinator if splitting would obscure ordering. Move cohesive operations and expose explicit dependencies; avoid hundreds of arguments, circular imports, giant barrels, or global singleton copies.
- Existing public imports should remain compatible through narrow re-exports. Dependencies flow from controllers toward helpers.
- Keep transaction/capture boundaries, snapshot ordering, echo suppression, drag suppression, cancellation, and permission rechecks intact.
- Update the nearest README with responsibilities and a navigation map after each extraction. Generated Prisma contracts and migration snapshots remain untouched.

Commits: separate `refactor(canvas)`, `refactor(sync)`, `refactor(selection)`, `refactor(ws)`, and `refactor(rooms)` slices, as applicable.

## Bounded verification

One primary browser matrix, one correction batch, and at most one confirmation round. Stop when the acceptance criteria are met; do not run an endless polish/test loop.

| Viewport | Required checks                                                          |
| -------- | ------------------------------------------------------------------------ |
| 320×568  | Centered tool picker; no back/account collision; single dock; sheets fit |
| 390×844  | Tools, styles, secondary menu, centered account link, draw/undo          |
| 844×390  | Short landscape sheets and account form scrolling                        |
| 768×1024 | Tablet default collapsed panels and tool grid                            |
| 1024×768 | Explicit panel opening; no oversized inspector/toolbar overlap           |
| 1440×900 | Full toolbar, compact inspector, anchored dock, dashboard hierarchy      |

Use computer/browser interaction for the matrix. Inspect guest and authenticated UI if an existing authorized session is available. Otherwise report the authenticated walkthrough limitation; do not fabricate results or create accounts solely for screenshots.

Basic interaction checklist:

1. Choose ellipse from the compact picker, draw, undo, redo; verify no viewport/data reset.
2. Open styles, then another panel, then tools; ensure one compact surface and correct focus/Escape behavior.
3. Access all secondary commands; enter/exit Zen; import/export menu remains in view.
4. Zoom, pinch/pan, pointer capture, and viewer read-only behavior still work.
5. Sign-in/signup/verification states have centered buttons, readable errors, and reachable submit controls.
6. Save/paginate/insert a library item; dismiss while loading and reopen without a stuck spinner.
7. Check keyboard navigation, accessible labels, reduced motion, and touch hit regions.

Run web typecheck and relevant existing unit tests once after UI extraction. Add a small regression test only for a new behavior or concrete risk (e.g. exclusive panel reducer or canceled request). Run one production web build. For engine/common or server extractions, run their existing focused suites and type checks; avoid broad reruns after each cosmetic adjustment.

Physical touch/pen, Safari mobile chrome/keyboard, and screen readers require real-device verification and must be reported honestly if unavailable.

## Git and handoff

1. Inspect status and preserve user changes. Start from current main; use a new branch such as codex/ui-consistency.
2. Commit the plan/design separately if requested, then implement in the slices above. Avoid a single combined visual/refactor/server commit.
3. Before publishing, inspect diff/whitespace, review README links, record checks and actual limitations, and push coherent commits.
4. Merge to main only when that implementation run is authorized to merge and required checks pass. Do not force-push or delete retained phase branches.
5. Leave one development stack running if the user requests a runnable handoff; retain their Redis and avoid duplicate server processes.
6. Final summary should distinguish UI changes, refactors, tests actually run, unverified states, and the app URL. Include before/after browser screenshots when implementation is complete.

## Definition of done

- All stated viewport checks pass without horizontal overflow or competing chrome.
- Current font and application behavior are preserved.
- Tool controls are centered; Sign in is centered; dock/panels occupy deliberate anchors.
- Secondary features are reachable without permanent five-button clutter.
- Large files have meaningful extracted responsibilities, not only renamed oversized hooks.
- DESIGN.md and nearby READMEs reflect the implemented structure.
- Small commits and actual verification evidence are recorded; no requested feature is silently removed.

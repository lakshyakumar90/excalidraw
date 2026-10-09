# Phase 19: the long tail — implementation handoff

## Goal and scope

Implement all ten Phase 19 features as one cohesive extension to the existing editor. This file is a plan, not evidence that these features have been implemented. Start by checking the current repository and applicable `AGENTS.md` files. Do not start another phase.

Deliver arrow binding, snapping/guides, alignment/distribution, frames, a personal library, laser pointer, participant following, basic touch/mobile support, accessibility, and text search/zen mode. Preserve editing, history, persistence, room roles, sync/reconnect, images, text, and Phase 18 rendering/export behavior.

Treat mobile support as a substantive slice with explicit acceptance criteria below. Phase 19 does not include full parity with every desktop shortcut, native handwriting recognition, public library marketplaces, nested/rotated frames, shared library administration, or voice/video collaboration. Report these boundaries honestly.

## Current code to extend

- `packages/common/src/element/types.ts` already defines `ArrowBinding`, `startBinding`, `endBinding`, `boundElements`, and `frameId`. There is no `frame` variant in the element union yet.
- `apps/web/src/lib/selection/arrowBinding.ts` already binds arrows to rectangle/ellipse/diamond shapes and updates linked arrows. Current creation finds endpoints on a shape, writes `gap: 0`, and stores a normalized `fixedPoint`. Extend this behavior; do not create a competing binding model.
- Inspect `Canvas.tsx`, `selectionController.ts`, `selectionTransforms.ts`, `resize.ts`, `handles.ts`, `boundElements.ts`, `elementClipboard.ts`, and `selectionOverlay.ts` before changing gestures or reference handling.
- `packages/engine/src/scene/scene.ts` and `history.ts` provide capture, committed changes, versioning, and history transactions. Use these mechanisms for user actions and dependent element changes.
- `PresenceAvatars.tsx` and `lib/presence/viewportJump.ts` already provide a one-time viewport jump. Extend them into continuous following.
- `packages/common/src/presence.ts`, `collab.ts`, `syncValidate.ts`, and the web `roomSync.ts` define the current room protocol and validation. Reuse the authenticated connection and existing rate limits.
- Inspect `CanvasWorkspace.tsx`, `Toolbar.tsx`, `CanvasControls.tsx`, `CanvasContextMenu.tsx`, `StylePanel.tsx`, tool definitions, persistence/import/export modules, and current keyboard handlers for UI integration.
- Renderer geometry, paint bounds, culling, SVG, and bitmap caching live in `packages/engine/src/renderer`. Frame clipping must reach every renderer and overlay that displays scene content.
- The database contract is `packages/db/src/prisma/contract.prisma`; its scripts use this repository's Prisma contract/migration workflow. Do not assume a conventional `prisma migrate dev` setup.

## Package ownership

| Location                  | Responsibility                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `packages/common`         | Browser/HTTP/WS shared element types, library DTOs, laser message unions, limits, pure wire validation                           |
| `packages/engine`         | Pure binding geometry, snapping, alignment, frame traversal/projection, rendering, hit testing and reusable scene algorithms     |
| `packages/backend-common` | Services and authorization/validation helpers shared by HTTP and WS; ephemeral cross-instance transport integration where needed |
| `packages/db`             | Prisma contract, migrations, the existing database client, and personal-library repository queries                               |
| `packages/auth`           | Existing session/identity handling; reuse its client and server entry points                                                     |
| `apps/http-server`        | Authenticated personal-library routes and transport-level request validation                                                     |
| `apps/ws-server`          | Authenticated room laser broadcasts, rate limiting, existing Redis pub/sub integration                                           |
| `apps/web`                | Gesture lifecycle, UI, browser storage, accessible interactions, transient guides/follow/search/zen state                        |

Do not create a DB file, DB client, auth implementation, Redis client, second room socket, or write queue inside a feature component. Browser packages must not import server-only auth/DB dependencies. Put HTTP-and-WS-only shared code in backend-common; put contracts needed by the frontend in common.

## Cross-cutting rules

1. One completed user operation creates one history entry and one coherent committed change set. Include bound arrows, bound text, and moved frame children in that capture. No-op operations produce no new versions/history.
2. In-progress movement, guides, laser trails, and following are transient. Use existing preview transport for element movement; do not bump versions or write the DB on pointermove.
3. Existing LWW is per element, not a distributed multi-element transaction. Do not claim atomicity across collaborators. Batch related commits, handle partial/reordered input and temporarily missing references, and define deterministic projection for invalid/dangling relations.
4. A remote apply must not trigger an automatic local recommit or history entry. Binding/frame projection for rendering must be pure and version-neutral. Locally initiated transforms may persist dependent changes in the same action.
5. Viewers may navigate, follow, search, use zen mode and participate in presence. They may use a laser subject to normal room membership/rate limits. They cannot mutate room elements or insert a library item; enforce this on the server as well as the UI.
6. Every new element variant/field must work through normalization, validators, scene loading, reconciliation, previews, clipboard, undo/redo, IndexedDB, Redis snapshots/flush, imports and Canvas/SVG/PNG export. Update exhaustive switches and boundary tests.
7. Escape user text in SVG and UI. Bound arrays, coordinates, serialized payloads, image references and library content size. Reuse existing scene limits rather than silently truncating data.
8. Read the relevant installed Next.js guides before writing frontend code, as required by `apps/web/AGENTS.md`.

## 1. Arrow binding

Move reusable boundary/intersection and endpoint projection math into the engine; keep scene/gesture orchestration in web. Preserve the existing binding wire fields and compatibility with existing `fixedPoint` records.

- Start/end endpoints bind to the nearest eligible live rectangle, ellipse or diamond within an initial 12 CSS-pixel acquisition radius (`12 / zoom` scene units). Choose deterministically by distance, stacking order, then ID. Highlight the candidate during drawing/endpoint editing.
- Project to the ideal geometric border, accounting for target rotation and shape type; the sketch jitter is decorative. Apply a documented small scene-space gap (initial default 4 units) outward from the border. Respect stored gaps.
- Moving, resizing and rotating a target updates both endpoints and arrow labels correctly. Support an arrow whose two ends bind to the same target and straight/curved arrows. Degenerate dimensions/zero-length arrows must remain finite.
- Dragging an endpoint away detaches it; dragging near another eligible shape rebinds it. Update old/new target reverse references without losing bound text entries. Whole-arrow dragging has an explicit policy: retain bindings while target-relative endpoints remain eligible; otherwise detach affected ends.
- Deleting a target clears dangling bindings while preserving the arrow's last valid endpoint. Undo restores relationships. Duplicate/paste/library insertion remap internal bindings and remove external references.
- For remote target movement or out-of-order arrival, use deterministic effective endpoint projection without synthesizing commits. Resolve missing targets again when they arrive.

## 2. Snapping and alignment guides

Add a pure snapping solver based on ideal world-axis-aligned bounds of live elements. Use screen-relative tolerances (initial 6 CSS pixels), not a fixed scene distance.

- Compare selected aggregate bounds against other elements' left/center/right and top/middle/bottom positions. Exclude the selection, tombstones, hidden/clipped-out targets, and frame descendants moving with the selection.
- Snap each axis independently and return geometry plus guide descriptors. Stable tie-breaking must prevent flicker; use a modest release tolerance greater than acquisition tolerance.
- Initially support translation drags and shape creation; integrate resize only with handle-aware constraints. Aspect ratio, minimum size and grid/angular constraints must have a documented priority.
- Alt temporarily bypasses snapping. Provide a persisted user setting to disable object snapping. Clear guides on pointerup, cancellation, Escape, tool change and unmount.
- Draw guides on the interactive overlay with zoom-independent visual thickness. Never serialize guide state or broadcast it as scene content.
- Bound candidate work for large scenes through a reusable spatial/candidate index refreshed on committed geometry changes. Avoid an all-elements comparison for every selected element on every pointer event.

## 3. Alignment and distribution

Provide align left/center/right/top/middle/bottom for at least two selected movable elements and distribute horizontally/vertically for at least three.

- Use aggregate world-axis-aligned bounds; alignment targets the selection bounds. Distribution uses equal gaps between outer edges, preserving the two outermost items. Define the stable ordering and behavior when equal gaps are negative.
- A selected group or frame is one layout unit. A bound label moves with its owner; bound arrows are resolved after owner movement. Resolve selection closure so descendants and dependencies move exactly once.
- Preserve sizes, angles and internal group layout. Disable actions when inapplicable/read-only. Expose them through an accessible selection menu and context menu.
- Apply all deltas in one existing history capture/commit; undo/redo restores every dependent element.

## 4. Frames

Add a typed `FrameElement` (`type: "frame"`, bounds, optional name) and a frame tool. Phase 19 supports axis-aligned flat frames; nesting and rotated frames are outside this initial implementation.

- Use existing `frameId` as the sole child-parent relation. A child belongs to at most one live frame. Choose membership by the child's center on a committed drop/create, using deterministic stacking/ID tie-breaking for overlapping frames. Do not auto-reparent from renderer execution.
- Moving a frame translates its children, child labels and affected arrows exactly once. Resizing changes the clipping rectangle without scaling children. Child-only movement can leave/re-enter a frame at gesture commit.
- Frame deletion releases children into the scene; an explicit delete-with-contents action may delete the closure with clear UI wording. Undo restores membership. Duplicate/export/import/library remap frame references.
- Render the frame at its own scene stacking position as a container; sort children by their order keys within it. Draw the frame outline/name outside the content clip. Define membership changes and stacking transitions consistently.
- Apply the same frame clip in Canvas, SVG clip paths, PNG, remote previews, hit testing, selection outlines, text/image overlays, search navigation and culling. Partially clipped content stays visible/selectable only in its visible region. World bounds outside a frame must not make hidden content clickable.
- Handle missing/deleted frames deterministically as detached effective content while deltas assemble. Reject malformed new relationships at mutation/import boundaries; preserve visible child data when importing unsupported nested frames by flattening them with documented rules.
- Add preview support for frames and include all affected children in frame-drag previews. Keep clipping viewport-independent and do not let cached bitmaps bake in stale parent/world transforms.

## 5. The personal library

Save selected element groups as named reusable stamps, scoped to the authenticated user. Provide a library panel with save, browse, insert, rename and delete plus loading/error/empty states.

- Add a user-owned library model through the existing Prisma contract and repository migration scripts. A minimal record has ID, ownerId, name, schema version, validated element JSON, asset metadata and timestamps. Use the existing Prisma client/repository patterns; do not write feature SQL or initialize another database.
- Add authenticated HTTP endpoints for list/create/update/delete. Derive ownerId from the auth session. Scope every query to that user; clients cannot transfer ownership. Apply payload limits, pagination, existing request protection, and useful errors.
- Saving normalizes coordinates around the selected bounds and includes the selection closure (groups, bound labels and internal references). External bindings/frame references are removed. A library item is independent of subsequent edits to its source scene.
- Insertion creates fresh element/group/frame IDs, versions/nonces and stacking keys, remaps every internal reference, positions around the insertion point, selects the result and emits one history entry/commit. Preserve seeds/styles for visual fidelity.
- Include image dependencies. Audit the current image storage authorization/lifetime before choosing a storage relation. A saved stamp must survive source-scene deletion; insertion into a room must copy/register assets with that destination before committing image elements. Do not reuse inaccessible scene-bound file IDs or silently omit images.
- Guests may use a device-local library in a separate IndexedDB namespace. Authenticated users' authoritative library is server-backed. Do not merge another user's/device library automatically; offer an explicit import if implemented.
- Saving a private stamp is allowed while viewing a room if existing access permits reading its elements/assets. Inserting it into a viewer room is forbidden.

## 6. Laser pointer

Add a laser tool and bounded scene-coordinate point batches to the existing ephemeral room protocol. Local use also works outside a room.

- Share message types and strict validators in common. The server supplies connection/user identity, checks membership and reuses the ephemeral rate budget and existing cross-instance pub/sub. No DB, durable room hash, snapshots, outbox or history writes.
- Throttle publication to about 33 ms. Use gesture IDs, sequence numbers, bounded batches and TTL. Ignore stale/duplicate batches. Use receiver-local monotonic arrival time for fading rather than trusting client wall clocks.
- Render per-user trails in the interactive layer with fading age and a bounded point count (initial 128 points per connection, approximately 1-second lifetime). Clear on disconnect, room switch, cancellation and inactivity. Stop animation when no trail is visible.
- Reduced motion uses a short-lived marker with no animated trail. A viewer can point without obtaining edit permission.

## 7. Follow mode

Extend the existing avatar action into explicit Follow/Stop following controls and a visible following indicator.

- Follow a particular connection ID, not only a user ID, so two tabs cannot alternate the target unexpectedly. Consume existing viewport updates and compute local scroll from the remote scene-space center plus local canvas dimensions.
- Track smoothly with bounded interpolation; reduced motion applies updates directly. Do not echo followed viewport changes as a new independently driven follow action or create follow loops. Keep presence publication bounded.
- Stop on Escape, explicit stop, local pan/zoom/drawing, target disconnect, access loss, room switch or unmount. Selecting another participant switches the target. Resize keeps the same scene center.
- Missing viewport data shows a disabled/explanatory state. Stop stale tracking after a documented inactivity interval, preserving the last local view. Follow state is transient and has no scene history.

## 8. Touch and mobile

Implement an explicit pointer/gesture state machine instead of adding ad hoc branches to mouse handlers.

- Track pointer IDs/types. One touch draws with an active drawing tool or pans in the hand tool. Two touches always pan and pinch; anchor zoom at the gesture centroid and keep the scene point under that centroid stable as fingers move.
- If a second touch arrives during a provisional drawing gesture, cancel that provisional drawing/history capture before entering navigation. Ending one finger cannot suddenly create a shape or start a new drag; wait for all navigation contacts to lift.
- Use pointer capture; handle pointercancel, lost capture, visibility changes and unmount. Gestures over UI must not reach the canvas. Respect zoom bounds and prevent page scrolling only on the interactive canvas.
- Basic palm rejection: while a pen is active, ignore touch drawing contacts and respect pen pressure. Document that browsers/hardware cannot guarantee perfect palm classification. Do not promise a heuristic as universal palm rejection.
- Collapse the toolbar and style panel on narrow screens, with reachable tool selection, undo/redo, zoom, library and exit controls. Use at least 44 CSS-pixel interactive targets, safe-area spacing and accessible menus. Handle portrait/landscape and keyboard-open text editing.
- Acceptance requires a real touch/stylus device when available. Browser emulation covers gesture math/layout but cannot certify hardware palm rejection. Record exactly which environment was used.

## 9. Accessibility

- Use a consistent keyboard toolbar model: roving focus and arrow navigation, Enter/Space activation, appropriate radio/toggle semantics, visible focus rings and accurate labels/shortcuts. Avoid trapping focus in a toolbar or canvas.
- Dialogs and panels have accessible names, close controls, Escape handling and return focus to their trigger. Global editor shortcuts do not fire in text inputs, text editing or unrelated dialogs.
- Give the canvas a descriptive accessible name/instructions. Provide an accessible scene summary/list with counts, text labels, type and selection state; keyboard users can navigate/select an element and reach its actions. Announce meaningful completed actions and search results through a polite live region.
- Throttle summary announcements to committed changes; pointermove, collaborator cursors and every laser/follow frame must not flood a screen reader.
- Respect `prefers-reduced-motion` for cursor/follow interpolation, laser, transitions and panel animations. Preserve sufficient contrast and non-color cues for active tools, snapping and following.
- Verify with keyboard navigation and one available screen reader. Do not claim full accessibility compliance from static attributes alone.

## 10. Search and zen mode

- Search live text element content case-insensitively, including wrapped and bound text. Ignore deleted elements. Return stable results with snippets, and update when text changes remotely. Handle empty queries, Unicode and zero results.
- Selecting a result centers the canvas on its visible bounds, identifies it with an ephemeral highlight, and optionally selects it when allowed. A viewer can navigate results without entering edit mode. Clip-aware navigation should not jump to wholly hidden frame content.
- Add a keyboard-accessible search panel (initial Ctrl/Cmd+F only when the canvas workspace is active and no input owns the shortcut), result next/previous controls and Escape dismissal/focus restoration.
- Zen mode hides editing/navigation chrome, menus, style panels, avatar stack and debug overlays. Preserve an accessible exit affordance/shortcut and essential access-loss/error notices. Dismiss open editing panels on entry without discarding committed work.
- Search/highlights/zen state never travel as element mutations. Store user preferences separately from scene data; room switches must not restore stale transient search/follow targets.

## Implementation order and small commits

Create/use a `codex/phase-19-long-tail` branch according to the current repository state. Inspect existing edits and unpushed commits first; preserve and identify unrelated work. Do not reset, squash or force-push. Commit coherent completed slices with their focused tests, and push normally to the branch. Avoid committing generated build caches just to make status clean.

1. Shared contracts/validators and pure arrow-binding geometry; extend existing binding lifecycle and tests.
2. Snapping solver, guides and alignment/distribution operations with history integration.
3. Frame model, validators, renderer/export/hit-testing support, membership and transforms. Separate model/rendering and UI commits if necessary, keeping every committed state coherent.
4. Personal-library Prisma contract/migration/repository and authenticated routes with ownership tests.
5. Library panel, insertion/reference/asset handling and guest storage.
6. Laser protocol/server/pub-sub and transient rendering.
7. Follow controls and lifecycle.
8. Touch state machine and compact mobile UI.
9. Keyboard/accessibility summary and reduced motion.
10. Search, zen mode and final integration documentation.

If foundational contract changes must land earlier, include their minimal consumers/compatibility handling so intermediate commits still type-check. Every feature commit should explain the resulting behavior, not just name modified files. Finish with `docs/architecture/phase-19-decisions.md` recording actual decisions, tests, manual results and limitations.

## Focused test matrix

Write tests for real invariants and failure modes, not helpers that merely repeat implementation arithmetic. Table-driven geometry/state-machine tests are preferred where cases share a setup.

| Feature       | Required cases                                                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Binding       | Each target type; rotated targets; near/outside threshold at different zooms; gap; move/resize/rotation; same-target ends; zero dimensions; detach/rebind; deletion/undo; copied IDs; remote target-before/after-arrow arrival; no feedback commits                                        |
| Snapping      | Edge/center axes; zoom tolerance; stable tie/hysteresis; selection/group/frame exclusions; rotated bounds; Alt/off setting; guides cleared on cancel; constrained resize if supported                                                                                                      |
| Layout        | All six align actions; equal-gap distributions; ties/overlap/negative gaps; groups/frames; labels/arrows; two-item distribution disabled; no-op versions; one-step undo/redo                                                                                                               |
| Frames        | Validation/factory/load; move children exactly once; resize without scaling; enter/leave; delete releases; missing parent; clipboard/group references; partial clipping; hidden-content hit test; SVG/PNG clipping; preview and reconnect                                                  |
| Library       | User A cannot list/read/change/delete B's items; session identity overrides body owner; invalid/oversize content; pagination; fresh IDs/reference closure on repeated insert; source changes/deletion independence; guest isolation; image registration/lifetime; viewer insertion blocked |
| Laser         | Malformed/oversize/NaN payloads; membership/rate limit; server identity; stale sequence; TTL/memory bound; disconnect cleanup; cross-instance forwarding without duplicate echo; no durable writes/outbox/history                                                                          |
| Follow        | Remote center/zoom across viewport sizes; selected connection among two tabs; resize; stale/disconnected target; local intervention/Escape; no loops; reduced motion; cleanup                                                                                                              |
| Touch         | Centroid/anchor math; pinch bounds; second-contact cancels provisional edit; one remaining finger cannot draw; pointercancel/lost capture; pen/touch conflict; UI contacts excluded                                                                                                        |
| Accessibility | Keyboard toolbar navigation/activation/focus; shortcut exclusion in inputs; dialog focus restore; canvas summary/list actions; announcement cadence; reduced-motion behavior                                                                                                               |
| Search/zen    | Unicode/case/empty query; deleted/bound/remote text; stable result order; clipped bounds; viewer navigation; panel focus; zen exit and critical notices; no scene commits                                                                                                                  |

Run relevant suites once per completed slice, in nonwatch mode, plus affected package type checks. At the end, run the combined affected suites once, relevant server checks, and one production web build. If a command stalls, inspect its output/process once, report progress, and resolve the concrete cause; do not restart broad suites repeatedly. Rerun only failed/changed checks. Use existing test infrastructure and avoid introducing a second browser test framework for this phase.

## Short end-to-end acceptance journey

Use two authenticated room clients (editor and viewer), then briefly test editor/editor behavior if needed. Keep the journey bounded and record outcomes:

1. Create rectangle/ellipse/diamond targets and an arrow near their borders; move, resize, rotate, detach and undo. Confirm remote previews and final geometry arrive correctly.
2. Drag with snapping, align/distribute a group, then create/move/resize a frame with text and an image. Confirm clipping, one-step undo and export output.
3. Save that selection to the personal library, reload, insert twice, and confirm independent IDs, internal bindings and images. Check another account cannot access the item.
4. Use laser from editor/viewer and follow the other connection; intervene locally, disconnect/reconnect, and confirm no stale trails or continued following.
5. Test search, zen exit, keyboard-only controls, reduced motion, and narrow-screen layout. Perform one touch/pinch/pen journey on available hardware or clearly identify emulation limitations.
6. Verify a viewer cannot forge new frame/binding/library insertion commits, and that normal Redis write-behind/reconnect still handles a scene containing frames.

Completion requires these visible behaviors, not only successful compilation or HTTP health checks. Preserve user scenes and avoid deleting existing rooms/accounts as test setup.

## Final operational handoff

After implementation, reuse or start one web, HTTP, WS and flush-worker stack with the existing local Redis. Check ports/processes first to avoid duplicate servers. Leave the project available for manual testing and give the actual URLs, branch, commit IDs, completed features, checks and remaining limitations. Do not claim hardware testing, production performance or accessibility verification that was not actually performed.

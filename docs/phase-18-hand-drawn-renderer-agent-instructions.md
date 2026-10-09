# Phase 18 implementation plan: the hand-drawn renderer

This is a plan, not an implementation or a completion report. Baseline inspected on 2026-10-09 after Phase 17. Implement only Phase 18 when explicitly asked to execute this handoff.

## Outcome and scope

Render rectangles, diamonds, ellipses, lines, and arrows with deterministic hand-drawn strokes; support none, solid, hachure, and cross-hatch fills; retain rounded edges and existing stroke styles. The same element must produce the same drawing commands on repeated renders and collaborating clients. Provide bounded caches and a reproducible 5,000-element browser benchmark. Preserve editing, hit testing, exports, collaboration previews, final commits, room permissions, and persistence.

Do not add a new drawing application, rendering library, authentication system, database, protocol for transmitting bitmaps, or Phase 19 functionality. Implement the requested algorithms in the existing engine. Text, images, and pressure-sensitive freedraw retain their current rendering behavior unless a small integration fix is necessary.

## Inspect before implementing

- `packages/engine/src/renderer/renderer.ts`, `svgRenderer.ts`, `culling.ts`, `viewport.ts`, `renderLoop.ts`, `renderState.ts`, `index.ts`, and their existing tests.
- `packages/engine/src/geometry`, especially local bounds, rotated bounds, arrowheads, curved lines, and pressure stroke outlines.
- `packages/engine/src/element/factory.ts` and scene mutation/version handling.
- `packages/common/src/element/types.ts`, element normalization, sync validation, preview contracts, and reconciliation rules.
- `apps/web/src/components/canvas/Canvas.tsx`, renderer setup, interactive overlays, remote previews, and export callers.
- `apps/web/src/components/styles/StylePanel.tsx` and `apps/web/src/lib/styles/styleStore.ts`.
- Existing export, renderer, culling, and collaboration tests and package scripts.
- Applicable `AGENTS.md`; before editing Next.js code, consult the installed Next.js documentation as required by `apps/web/AGENTS.md`.

Existing behavior to reuse:

- Elements already carry `seed`, `roughness`, `edgeStyle`, `fillStyle`, stroke styles, version, and versionNonce.
- Sloppiness already uses numeric roughness 0/1/2. Keep those persisted values; map them to Architect/Artist/Cartoonist settings. Architect remains the clean, zero-jitter option.
- Canvas and SVG separately implement seeded polyline jitter. Replace this duplication with shared geometry; current jitter is not the requested double Bézier algorithm.
- Canvas fills currently draw diagonal lines and rely on `context.clip()`. Implement explicit intersection-based hatch segments shared with SVG.
- Rounded polygons, rotation transforms, arrows with bound text gaps, and curved lines already exist. Preserve these behaviors.
- Static rendering already uses dirty invalidation and viewport culling. Interactive rendering runs every frame. Improve the existing pipeline rather than rebuilding it.

## Package boundaries

| Location | Responsibility |
| --- | --- |
| `packages/engine/src/renderer` | PRNG, pure sketch geometry, fill intersections, Canvas/SVG adapters, caches, renderer integration and performance instrumentation. |
| `packages/engine/src/geometry` | Reusable geometric helpers needed by rendering and existing geometric operations. |
| `packages/common` | Existing browser/server element contracts; change only if genuinely necessary and compatible with normalization/validation. |
| `apps/web` | Existing style controls, lifecycle/cache ownership, previews, exports, a development-only stress harness if needed. |
| `packages/backend-common` | Server-only shared behavior; renderer/browser helpers do not belong here. |
| `packages/db`, `packages/auth`, HTTP, WS, Redis, worker | Preserve existing responsibilities; Phase 18 should require no schema, auth, or persistence changes. |

Suggested engine modules: `sketch/prng.ts`, `sketch/settings.ts`, `sketch/path.ts`, `sketch/shapes.ts`, `sketch/hachure.ts`, `sketch/geometryCache.ts`, and `elementBitmapCache.ts`. Adapt names to repository conventions. Export only APIs callers need.

## 1. Deterministic path generation

Implement a small mulberry32 or xorshift PRNG with explicit unsigned 32-bit seed normalization. Treat seed zero as a valid input. Define a stable fallback for legacy missing seeds; rendering must never generate or persist a random seed during a frame. Validate legacy seed behavior against existing scene normalization.

Use independent derived streams for outline pass 0, outline pass 1, fill, and hatch direction. Derive them from the seed and fixed purpose constants, never global state, render order, time, zoom, viewport, or cache-hit order. Changing fill should not change the outline. Rendering one element must not consume another element's randomness.

Represent generated geometry as immutable numeric path commands, such as move/line/quadratic/cubic/close, plus separate outline and fill paths and conservative paint bounds. Keep generation free of DOM, Canvas, database, and React dependencies. Canvas and SVG consume the same commands. Do not promise identical antialiasing pixels across browser engines; deterministic geometry is the contract.

## 2. Lines and shape outlines

For each straight segment, compute tangent and normal vectors. Draw two cubic Bézier passes with independently jittered control points displaced primarily perpendicular to the segment. Scale amplitude by preset roughness and length with a documented upper bound; very short edges must not become knots and very long lines must not become giant curves. Handle zero-length segments safely.

For sharp rectangles and diamonds, generate four logical edges with small bounded endpoint overshoot. Share the same logical vertices across passes while drawing each pass independently. At roughness zero, use a single clean outline, zero overshoot, and no double-stroke darkening.

For ellipses, sample a bounded number of angular points, jitter radii independently for each pass, and fit a closed smooth Bézier curve with seam continuity. Use the true elliptical coordinates, support extreme aspect ratios, and handle degenerate dimensions. Do not reuse a rectangle preview or turn the ellipse into a visibly faceted polygon.

Straight and curved line/arrow behavior must retain arrowhead direction, bindings, bound-text openings, and curves. Sketch the shaft without introducing a stroke through a text gap. Apply compatible sketch strokes to arrowheads. Keep pressure freedraw and its closed outline intact.

Preserve stroke color, width, dash/dot style, opacity, and center-based rotation. Apply element opacity once to the composed element, so overlapping outline passes and hatch strokes do not unintentionally change the requested opacity. Restore Canvas context state after every element.

## 3. Fill geometry

Define a fixed default hatch angle and spacing in scene coordinates, with bounded spacing related to stroke width. Neither angle nor spacing may change with viewport zoom or DPR. Transform the shape into hatch coordinates, enumerate scanlines, compute boundary intersections, sort and deduplicate them, and emit inside pairs. Use a consistent half-open edge rule for vertices and horizontal/parallel edges to avoid doubled or missing segments.

For polygons, intersect with their edges. For ellipses, use analytic intersections or a documented bounded-error flattening method. Rounded shapes must clip against the rounded boundary, not the original sharp box. If curves are flattened for clipping, bound the geometric error and segment count. Jitter hatch strokes inside a clipping boundary; Canvas/SVG clipping may be used as an additional guard, not as a replacement for intersection generation.

Cross-hatch runs the same function at the base angle and base angle + 90 degrees with a separate deterministic stream. Solid fill uses one closed slightly jittered contour compatible with the outline and cannot leave visible corner holes. None emits no fill. Inspect the legacy `fillStyle: none` plus nontransparent-background compatibility branch before changing its behavior; normalize legacy records deliberately without making new explicit None selections fill unexpectedly.

Cap scanline/segment generation for unusually large elements. Document any complexity guard or spacing adjustment; never loop across unbounded user dimensions or allocate enormous arrays/canvases.

## 4. Rounded corners and presets

Use the existing `edgeStyle: rounded` field rather than inventing `edges` or a competing persistence format. Connect trimmed edges with tangent corner arcs or Bézier equivalents. Radius is proportional to the smaller normalized dimension and clamped by adjacent edge lengths. Sharp and rounded shapes must use consistent fill boundaries and conservative paint bounds.

Define one engine settings table for Architect=0, Artist=1, Cartoonist=2, including amplitude, length scaling, overshoot, and second-pass separation. Reuse it for live Canvas, previews, and exports. Existing UI labels may be updated where needed; do not create a second sloppiness control. Style changes must use existing committed mutation/version/history pathways and sync to collaborators.

## 5. Geometry and bitmap caches

Cache pure sketch commands separately from rendered bitmaps. Generating random geometry must happen only on a miss or a changed visual input; panning alone must not regenerate it.

Bitmap identity includes element ID, version, versionNonce, zoom bucket, DPR, renderer revision, and all additional visual dependencies not covered by element versions. ID+version alone is insufficient: reconciliation can replace an element with the same version and a higher nonce. Track resource changes for text/images if they use the cache; alternatively keep those renderers outside this cache.

Choose and document zoom buckets; size a bitmap for its bucket's scale and draw it back at the current viewport scale. Bucket/DPR changes invalidate resolution, not seeded geometry. Draw cached images in scene coordinates with correct rotation, layer order, opacity, and padding for stroke/jitter/overshoot. Avoid double-applying transforms or opacity.

Use `OffscreenCanvas` where available and an HTML canvas fallback. Inject a canvas factory for tests and keep browser globals out of module initialization. Cap pixel dimensions, bytes, and entry count; use LRU eviction, release evicted resources, and avoid huge allocations for giant shapes or high zoom. Oversized elements render directly or in bounded tiles. Own caches per scene/renderer and dispose them on unmount or scene changes.

Deletion, undo/redo, style mutation, remote reconciliation, imports, and seed changes must invalidate the relevant entry. During local drags and remote ephemeral previews, geometry may change without a version bump: bypass committed bitmap entries or use transient visual fingerprints/generations and a bounded separate cache. Never persist or version-bump a preview merely to invalidate rendering. Transient entries must not evict the entire committed scene on every pointer event.

Cull using conservative rotated paint bounds expanded for stroke, caps, arrowheads, jitter, overshoot, and fill. Culled elements must not allocate bitmaps or generate sketch geometry. Reuse measured bounds and scratch storage where profiling demonstrates a benefit. Do not add a spatial index unless the benchmark identifies culling as a remaining bottleneck.

## 6. Integration and exports

Route committed shapes, local creation previews, and remote geometry previews through compatible sketch generation. Missing preview styles/seeds must use deterministic fallbacks or the existing committed element's style. If the preview protocol truly needs a small optional field, update common contracts, validators, server fan-out and client adapters together; preserve backward compatibility and avoid transmitting geometry caches or images.

Keep selection outlines, resize handles, cursors, and participant selections on the existing crisp interactive layer. Hit testing, snapping, bindings, scene bounds and reconciliation still use logical geometry; renderer jitter is decorative.

SVG must consume the shared path commands and preserve fills, clip paths, dashes, rotation, opacity and unique definition IDs. PNG/clipboard exports must render at their requested resolution without reusing low-resolution screen bitmaps. Account for decorative paint bounds in export padding so corners and arrowheads are not cropped. Exports must exclude ephemeral presence and unfinished remote previews.

## 7. Required focused test cases

Implement meaningful tests against pure commands, geometry invariants, cache behavior, and existing renderer adapters. Prefer table-driven cases over large pixel snapshots. Use a few browser visual fixtures to validate appearance; exact Canvas pixel equality across browsers is not the determinism test.

| Area | Required cases and assertions |
| --- | --- |
| PRNG | Known output vectors; zero/negative/large seeds normalize predictably; same seed repeats; distinct seeds differ; independent streams; no runtime randomness. |
| Determinism | Same element repeatedly, different element render orders, cold/warm caches, Canvas/SVG adapters, and zoom/DPR changes retain identical scene-space commands. |
| Line | Horizontal/vertical/diagonal, short/long/zero-length segments; finite bounded controls; two distinct rough passes; clean zero-roughness output. |
| Polygons | Rectangle/diamond, tiny dimensions, normalized flipped dimensions, all presets; bounded overshoot and closed fill contour. |
| Ellipse | Circle, wide/tall ellipses, zero/tiny dimensions; finite controls, continuous closed seam, independent outline passes. |
| Rounded edges | Small/large radius, narrow shapes, sharp/rounded toggles; tangent continuity and fill containment. |
| Hachure | Rectangle/diamond/ellipse/rounded boundary; tangencies, vertex crossings and parallel edges; sorted paired intersections; no segments outside clipping bounds; fixed scene-space spacing. |
| Fill | None, solid, hachure, cross-hatch; transparent background, legacy compatibility, independent outline stream; perpendicular hatch directions. |
| Styles | Width/color/dash/dot, opacity 0/50/100, all presets; context save/restore; opacity composition; style mutation uses history/version pathways. |
| Transforms | Translation, center rotation, zoom and DPR; paint bounds include every decorative extent without changing logical hit testing. |
| Lines/arrows | Straight/curved shafts, arrowheads, text gaps, bound endpoints; existing freedraw/text/image regression tests remain valid. |
| Geometry cache | Hit for unchanged visuals; seed/style/geometry/version/nonce invalidate; no reroll on pan or zoom; bounded eviction. |
| Bitmap cache | ID separation, equal version/different nonce, zoom bucket/DPR, deletion, undo/redo, remote replacement, scene switch/disposal; byte cap and oversized fallback. |
| Previews | Same version with changing geometry redraws; local and remote ellipse stay ellipses; final commit immediately replaces preview; no preview version bump/persistence. |
| Culling | Rotated corners, thick strokes and overshoot at viewport edges; deleted/fully invisible elements skip geometry generation and bitmap creation. |
| Exports | Canvas/SVG command parity, rounded/hatch styles, high-resolution PNG, opaque/transparent backgrounds, uncropped decorative bounds, no presence overlays. |

Add cases to existing suites where appropriate. Suggested focused files are sketch PRNG/shapes/hachure/cache tests plus extensions to `svgRenderer.test.ts`, `culling.test.ts`, and `renderLoop.test.ts`. Use fake contexts/factories for command and cache tests, and a real browser for visual/performance assertions. Do not mock away the geometry under test.

## 8. Reproducible 5,000-element benchmark

Generate a deterministic stress scene with a fixed scene seed and mixed rectangles/diamonds/ellipses/lines/arrows, fill styles, presets and rotations. Keep at least one fixture with heavy cross-hatch. Keep benchmark data development-only and avoid creating server rooms or writing thousands of database records.

Run these separate scenarios: mostly culled 5,000 elements, approximately 500 visible elements while panning, all 5,000 visible at zoom-out, cold cache, warm redraw, zoom bucket transitions, and a continuously changing local/remote preview over the scene. Include a high-DPR case and enforce the cache budget.

Record browser, hardware, build mode, viewport, DPR, seed, visible count, warm-up and sample count. Measure actual render durations with `performance.now()` (median/p95), generated geometry count, bitmap hits/misses/evictions, estimated retained bitmap bytes, visible/culled counts and long frames. Do not infer renderer performance from RenderLoop FPS alone: the static layer can remain idle while its animation loop reports 60 FPS.

Capture a crisp/baseline measurement before replacement and compare the completed renderer. Suggested initial targets: no geometry rebuild or bitmap allocation for unchanged warm elements; zero allocation for culled elements; cache stays within its configured byte cap; p95 warm pan with about 500 visible elements approaches a 16.7ms frame budget on the recorded desktop. For all 5,000 visible, report honest cold/warm numbers rather than inventing universal 60 FPS. Set measured acceptable limits in the report and explain any missed target.

Profile before optimizing. Prioritize skipped invisible work, reuse of paths/bitmaps, bounded hatch complexity and per-frame allocation. Avoid an unrelated render-loop rewrite. Record observations and one before/after result for each substantive optimization.

## 9. Bounded verification workflow

Use the existing Vitest installation. Run focused new/affected renderer tests in nonwatch mode once, for example `pnpm --filter @repo/engine exec vitest run src/renderer`, then rerun only failures or tests affected by a correction. Check common/engine/web types with the existing workspace tasks. Run the web production build once after integration; rerun only if a build failure or subsequent relevant change warrants it.

Do one short browser visual journey: draw each supported shape, cycle presets/fills/rounded edges, rotate/resize, undo/redo, and export SVG/PNG. Do one two-browser collaboration journey covering local/remote preview, final commit and viewer rendering. Run the defined benchmark once after optimization; repeat only a failed scenario or to quantify a specific fix.

A stalled command needs diagnosis, not repeated broad suites. Use finite test commands and bounded benchmark sample counts. Do not launch unattended test watch processes or test unrelated authentication/database flows. Do not call a checklist item complete based solely on type checks or the presence of code.

## 10. Implementation and commit order

1. Record baseline visuals/timings and renderer decisions; add deterministic PRNG/settings/path commands and their focused tests.
2. Add double Bézier lines, sharp shapes, ellipses and rounded corners with geometry tests.
3. Add clipped hachure/cross-hatch/solid fills and their edge-case tests.
4. Integrate shared Canvas/SVG commands, existing styles, line/arrow behaviors and exports; add adapter regressions.
5. Add geometry/bitmap caches, invalidation, bounds/culling and preview handling with cache tests.
6. Add deterministic stress harness, measure, optimize evidenced bottlenecks, and record benchmark results.
7. Complete the bounded checks and short visual/collaboration journeys; document actual results and limitations.

Use small coherent commits in this order, with tests next to the implementation they verify. Inspect the working tree first and preserve existing edits. Follow the branch convention `codex/`; push the completed feature branch when implementation is authorized. Stage intended files explicitly, exclude secrets/generated build-info and benchmark dumps, and do not squash everything into one huge commit. Do not publish real invitation emails or alter database schemas for renderer testing.

Write `docs/architecture/phase-18-decisions.md` with algorithm constants, seed semantics, preset mapping, fill compatibility, cache keys/budgets, preview behavior, export integration, test results and measured benchmark numbers. At implementation completion, run/reuse the web, HTTP, WS and flush worker with the user's existing Redis, verify basic readiness, leave the app running for manual testing, and report changes, check results, benchmark limits, commit IDs, pushed branch and URLs.

## Completion gate

All ten requested Phase 18 features have working integration and relevant evidence: deterministic PRNG, jittered double lines, sketch polygons, sketch ellipses, clipped hachure, cross-hatch/solid fills, rounded corners, presets, bounded bitmap caching, and measured 5,000-element performance. Existing editing, exports and collaboration remain functional. Any incomplete requirement or failed benchmark target must be named explicitly.

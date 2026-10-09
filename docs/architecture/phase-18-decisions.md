# Phase 18 renderer decisions and verification

## Rendering

- `packages/engine/src/renderer/sketch` owns the seeded Mulberry32 PRNG, roughness presets, and deterministic geometry used by Canvas and SVG export. Geometry is keyed by element identity/version and bounded to 2,048 recently used entries.
- Shapes use cubic double-stroke outlines; ellipse paths are sampled and fit as closed curves. Rectangle and diamond vertices can be rounded, and overshoot/jitter are derived only from the element seed and roughness.
- Solid fills use the shared closed contour. Hachure and cross-hatch fills use bounded scanline intersections against that contour, so the same segments are used in Canvas and SVG.
- Straight and curved lines and arrow shafts use shared seeded cubic paths. SVG keeps shape, line, and arrow geometry deterministic with the Canvas renderer. Freedraw continues to use its existing stroke-outline renderer.
- Renderer culling adds padding for roughness, overshoot, stroke width, and arrowheads so visible sketch strokes are not clipped at viewport edges.

## Bitmap caching

- Static rectangles, ellipses, diamonds, lines, and unlabeled arrows are rasterized once and reused. Labeled arrows remain on the direct path to preserve the label gap and layout.
- Cache keys include identity, version, version nonce, zoom bucket, pixel ratio, shape/line geometry, and visual style. Opacity is composed when the bitmap is drawn.
- Zoom is bucketed in half-octaves between 0.25x and 4x. Oversized entries bypass the cache; the LRU is capped at 64 MiB and each bitmap at 2 million pixels / 2,048 pixels per side.
- The canvas owns and clears its cache when disposed. Zoom-out-of-range and oversized elements fall back to vector rendering.

## Benchmark

Use `/dev/renderer-benchmark` in development to generate isolated 500- and 5,000-element scenes. It reports cold render, warm median/p95, pan median, visibility, and cache use. The stress scene does not modify or persist the user's canvas.

One local development run on 2026-10-09 (in-app Chromium, 4 reported cores, DPR 1.1, 319x523 viewport) measured:

| Scene          | Visible |       Cold | Warm median | Warm p95 | Pan median | Cached bitmap memory |
| -------------- | ------: | ---------: | ----------: | -------: | ---------: | -------------------: |
| 500 elements   |     500 |   400.5 ms |     14.9 ms |  24.0 ms |    12.3 ms |              6.2 MiB |
| 5,000 elements |   1,216 | 1,038.6 ms |     91.1 ms | 114.8 ms |    85.0 ms |             16.7 MiB |

The 5,000-element result is a development-mode stress measurement, not a production performance claim; it exceeds a 16.7 ms frame budget on this narrow WebView. The benchmark exposes that limit for future profiling. The warm cache produced 8,492 hits / 500 misses for the 500-element scene and 21,024 hits / 1,336 misses for the stress run, with no evictions. Use a production build and a normal browser viewport for comparable release measurements.

## Verification

- `pnpm --filter @repo/engine exec tsc --noEmit`
- `pnpm --filter @repo/engine exec vitest run src/renderer/sketch src/renderer/elementBitmapCache.test.ts src/renderer/benchmark.test.ts src/renderer/svgRenderer.test.ts src/renderer/culling.test.ts` — 6 files, 23 tests passed.
- `pnpm --filter web check-types`
- Browser smoke: `/` and `/dev/renderer-benchmark` returned 200, `/health` returned 200, benchmark completed, and the browser reported no errors or warnings.

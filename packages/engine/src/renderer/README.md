# renderer

Browser-independent drawing geometry, tools, renderer, scene capture, and history.

## Subfolders

- [sketch](./sketch/README.md)

## Files

- `benchmark.test.ts` — focused regression tests.
- `benchmark.ts`
- `culling.test.ts` — focused regression tests.
- `culling.ts`
- `elementBitmapCache.test.ts` — focused regression tests.
- `elementBitmapCache.ts`
- `drawConnectors.ts` — line, arrow, curve, and polyline drawing.
- `drawElements.ts` — element type dispatch and image/frame fallback rendering.
- `drawPaths.ts` — seeded sketch paths, stroke appearance, and shape outlines.
- `drawText.ts` — freehand outline and text rendering.
- `drawTransform.ts` — shared local element rotation and translation.
- `index.ts`
- `renderer.ts`
- `renderLoop.test.ts` — focused regression tests.
- `renderLoop.ts`
- `renderState.ts`
- `svgRenderer.test.ts` — focused regression tests.
- `svgRenderer.ts`
- `viewport.test.ts` — focused regression tests.
- `viewport.ts`

## Working here

Keep changes within this folder’s responsibility. Follow the owning app/package README for setup and checks; use shared packages for reusable logic. Do not edit build output or store credentials here.

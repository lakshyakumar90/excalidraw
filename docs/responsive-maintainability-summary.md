# Responsive interface and maintainability update

## Interface

- Below 1200px, drawing tools and styles open on demand. The tool grid wraps so every tool remains reachable without horizontal scrolling.
- Compact tool/style/extension panels coordinate opening, preventing multiple panels from covering the same controls.
- Styles have a small collapsed control and bounded scrollable content. Desktop styles leave the toolbar and bottom action bar clear.
- The canvas is sized by its dynamic viewport container, with ResizeObserver and visual viewport resize handling.
- Account, sign-in, signup, and room pages retain document scrolling. Dashboard headings/actions wrap; account padding and form controls fit compact screens.
- The smallest phone action bar uses five columns; landscape panels retain scrollable content. Public account inputs stay readable on mobile.

## Code organization

- Canvas.tsx now owns React state, overlays, import/drop UI, and persistence wiring; interaction lifecycle lives in the canvas hook.
- Touch/palm navigation has its own input module.
- Help dialog and reusable style fields are separate components.
- Room participant/reconciliation helpers are separate from the sync state machine.
- Renderer orchestration, element drawing, and bitmap caching are separate engine modules.
- Scene record helpers are separate from Scene capture/history operations.
- Collaboration protocol models, validators, and snapshot chunking are separate common modules, preserving the existing public imports.
- Compiler cache files are untracked and remain ignored.
- Root setup documentation replaces the starter README. Maintained app/package/source folders have README navigation and ownership information; generated output and migration snapshots are excluded.

## Verification

- Browser inspection: 320px and 390px phone widths, 768px tablet, 1024px, and 1440px desktop; 844x390 landscape account forms.
- Mobile tool selection and committed ellipse drawing worked; the test drawing was undone.
- Styles stayed collapsed by default on compact screens, the tool grid exposed all tools, and landscape account forms scrolled to their submit/switch controls.
- Sign-in and signup forms were inspected without submitting account credentials. The authenticated dashboard was reviewed in source; no authenticated browser account walkthrough was performed.
- Common tests: 49 passed. Focused engine tests: 31 passed. Focused web sync/follow/clipboard tests: 19 passed.
- Web/common/engine type checks passed. Full workspace production build: 8 tasks succeeded.
- Targeted lint was checked and existing React effect/ref issues in the touched editor were addressed. The mechanical design scan found an existing style hover combination with an explicit matching hover foreground; no broader visual redesign was performed.
- Physical phone/tablet touch, Safari keyboard/browser chrome, and screen readers were not available for hardware verification.

## Integration

The Phase 15, 16, 17, 18, and 19 branches were verified as ancestors of the responsive branch. Earlier phase work is inherited through that history. Main is also an ancestor; integration preserves those commits and retains the named phase branches.

Services remain available through the root development stack: web 3000, HTTP 5000, WebSocket 8080, local Redis 6379, and the snapshot flush worker.

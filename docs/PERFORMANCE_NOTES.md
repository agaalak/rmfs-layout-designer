# Performance Notes

Date: 2026-05-13

## Current Status

- `npm run build` passes.
- The previous single large bundle warning has been resolved with Vite manual chunks.
- Current production chunks separate React/Zustand, Konva/React-Konva, Lucide icons, and app code.

Latest build output shape:

- `react-*.js`: about 12 kB.
- `icons-*.js`: about 12 kB.
- `canvas-*.js`: about 316 kB.
- `index-*.js`: about 376 kB.

## Improvements Made

- Added `build.rollupOptions.output.manualChunks` in `vite.config.ts`.
- Kept the canvas rendering library unchanged to avoid destabilizing the editor.
- Moved dense analytics UI into the Analyze workflow so it is not always visible.
- Isolated simulation controls in Simulation workflow, reducing normal Design UI rendering pressure.
- Reduced always-on right-panel noise by moving broad analytics/validation out of Design properties.
- Added a smoke E2E script (`npm run test:e2e:smoke`) that checks startup, workflow navigation, and responsive drawers without running the full editor/simulation suite.

## Remaining Risks

- Analytics and validation still run through `useMemo` whenever the layout object changes. This is acceptable for current demo sizes, but larger layouts may need worker-based computation.
- Candidate generation can still be CPU-heavy for high candidate counts.
- Rack bin tables are scrollable but not virtualized.
- Konva canvas layers are still all mounted in the main canvas. This is fine now, but future simulation growth may need more memoization.
- The smoke E2E suite is faster than the full suite but still exercises a heavy Konva/Vite page. More speed will require test fixture slimming or mocked layout loading.

## Recommended Next Steps

1. Lazy-load heavy dialogs and simulation panel with dynamic imports.
2. Move validation and analytics to a web worker for very large layouts.
3. Virtualize the rack bin table for large rack definitions.
4. Memoize graph construction by layout revision/hash instead of rebuilding from object identity.
5. Add lightweight candidate mini-map generation that does not mount full Konva stages.

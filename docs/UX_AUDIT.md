# UX Audit

Date: 2026-05-13

This audit reflects the current UI after running the build, unit tests, Playwright E2E tests, and inspecting the React/Konva workflow structure. It focuses on organization and usability, not new simulation or algorithm features.

## Verification Status

- `npm install`: passed, 0 vulnerabilities.
- `npm run build`: passed.
- `npm test -- --run`: passed, 10 test files / 52 tests.
- `npm run test:e2e:smoke -- --workers=1`: passed, 3 browser smoke tests.
- `npm run test:e2e -- --workers=1`: passed, 11 browser tests.
- `npm run dev`: Vite starts on `http://127.0.0.1:5174/`.

## Current Screen Structure

The app is now organized around five workflows:

- Design: manual Mode A editing and object properties.
- Generate: Mode B, Hybrid generation, and candidate comparison.
- Analyze: validation, analytics, heatmaps, and analytics exports.
- Simulate: Experimental 2D playback, isolated from core editing.
- Files: import/export JSON, report/image/analytics exports.

The screen has an app header, contextual workflow toolbar, left workflow rail, optional grouped design toolbox, central canvas, workflow-specific right panel, and a status bar.

## Top Toolbar Problems Found

- P1: The old toolbar mixed every action into one horizontal strip.
- P1: On normal desktop widths, actions competed for space and meaning.
- P1: Simulation controls, exports, analysis, and design tools were visually equal even though they belong to different workflows.

Fix:

- Added a persistent app header plus a contextual toolbar.
- Moved workflow-specific actions into Design, Generate, Analyze, Simulate, and Files contexts.
- Kept icon-only controls accessible with labels/tooltips.

## Left Toolbox Problems Found

- P1: The old toolbox was a flat list with no workflow grouping.
- P1: A user could not immediately tell which tools draw cells versus place resources.
- P2: Tool explanations were only implicit.

Fix:

- Grouped tools into Navigation, Draw Cells, Place Resources, and Traffic.
- Added selected-tool helper text.
- Disabled editing tools outside Design/while Simulation is active with explanatory tooltips.

## Right Properties Panel Problems Found

- P1: Rack/bin editing made the panel feel like one giant form.
- P1: Validation and analytics competed with object property editing.
- P2: Empty selection lacked first-use guidance.

Fix:

- Added property section tabs/labels for racks, stations, chargers, parking, and rotation zones.
- Kept the bin table scrollable and tied to the rack section.
- Replaced broad analytics/validation clutter in Design with selection-specific validation and a quick-start empty state.

## Bottom Analytics Panel Problems Found

- P1: The bottom strip was dense and always visible.
- P1: Validation and metrics were hard to scan in the same surface.

Fix:

- The dense bottom analytics strip now appears only in Analyze workflow.
- Analyze workflow has summary cards, tabs, heatmap controls, validation filters, and exports.

## Dialog / Modal Problems Found

- P2: Generation dialogs are usable but still basic.
- P2: Import/export dialog exists, while Files workflow now provides direct actions too.

Remaining:

- Add stronger focus trapping and Escape-close tests for dialogs.

## Candidate Drawer Problems Found

- P1: Candidate preview was not visually separated enough from apply.
- P1: Closing a candidate drawer could leave a preview layout as the active layout.

Fix:

- Added Valid/Invalid and Experimental family badges.
- Added separate Preview and Apply actions.
- Added "Why this score?" details.
- Closing an unapplied preview restores the original active layout.

## Simulation Mode UX Problems Found

- P1: Simulation looked too stable/prominent for an experimental feature.
- P1: Simulation controls were mixed with layout-design mental models.

Fix:

- Simulation workflow is labeled Experimental in the workflow rail, toolbar, and panel.
- Added warning copy: not full MAPF and not final traffic validation.
- Grouped controls into Setup, Tasks, Playback, Metrics, Visual Options, Event Log, and Exports.

## Responsive / Small-Screen Problems

- P1: Desktop remains the primary target.
- P2: Below desktop width, panels now open as drawers, but the experience is still optimized for tablet-plus rather than phones.

Current mitigation:

- The workflow rail stays accessible.
- Design tools and workflow panels open through responsive drawer buttons.
- The app header warns that layout editing is best on a larger screen.

Remaining:

- Add Escape-close/focus-trap hardening for responsive drawers.
- Add more visual QA at 768-1024 px widths.

## Keyboard Accessibility Problems

- P1: Main buttons mostly have accessible names, but deeper dialogs need more focus-trap QA.
- P2: Shortcut help exists and is reachable from the header.

Fix:

- Workflow buttons include `aria-label` and `aria-current`.
- Icon-only buttons include `aria-label`/`title`.
- Property sections use form labels.

## Color / Contrast / Readability Problems

- P1: Previous action hierarchy was too flat.
- P2: Some canvas colors are still dense when the layout is large.

Fix:

- Added stable/experimental badges and consistent metric cards.
- Preserved semantic object colors and validation colors.

## Workflow Confusion Points Fixed

- Design editing is no longer mixed with generation, analytics, files, and simulation.
- Candidate preview/apply is now explicit.
- Simulation is clearly experimental.
- Empty selection gives first-use quick actions.

## Remaining Prioritized UX Issues

- P1: Add focus trap and Escape-close behavior for responsive drawers.
- P1: Add richer dialog accessibility tests.
- P1: Add candidate mini-map thumbnails.
- P2: Add more refined visual density controls for very large layouts.
- P2: Add a compact "current object" breadcrumb near the canvas.

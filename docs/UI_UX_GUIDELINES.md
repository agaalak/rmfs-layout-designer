# UI / UX Guidelines

These rules describe the current RMFS Layout Designer interface and should guide future changes.

## Layout Structure

- Use the workflow rail for primary navigation: Design, Generate, Analyze, Simulate Experimental, Files.
- Keep the app header compact: app title, current layout, workflow, unsaved status, and one primary contextual action.
- Keep the second toolbar contextual. Do not add every new command to every workflow.
- Keep Design focused on manual editing and properties.
- Keep Generate focused on Mode B, Hybrid, candidate preview, and candidate apply.
- Keep Analyze focused on validation, analytics, heatmaps, and reports.
- Keep Simulation isolated and marked Experimental until it is a reliable discrete-event simulator.
- Keep Files focused on import/export.
- Keep canvas view controls floating inside the canvas so fit/zoom/toggles are available in every workflow.

## Component Usage

- Use `.toolbar-button-primary` for the primary action in a workflow.
- Use `.toolbar-button` for secondary actions.
- Use `.icon-button` only when the icon is familiar and there is a clear `aria-label` and `title`.
- Scope duplicate actions carefully in tests and UI copy. For example, "Reset view" is distinct from simulation "Reset".
- Use `.badge-stable` and `.badge-experimental` for workflow maturity.
- Use `.metric-card` for scan-friendly metrics.
- Use section titles with `.panel-title`.
- Keep large tables scrollable inside their own section.

## Colors

- Road / aisle: light gray.
- Rack storage: blue or blue-gray.
- Rack / pod: blue split treatment for face distinction.
- Station: orange.
- Queue: yellow/orange.
- Charging: green.
- Parking: purple.
- Rotation: pink/red or yellow with circular symbol.
- Blocked / wall / column: dark gray.
- Human zone: beige/red-tint.
- Dock / door: brown/gray.
- Error: red.
- Warning: amber.
- Info: blue.
- Success: green.

Color should never be the only state indicator. Pair color with text, badges, outlines, or icons.

## Typography

- Use small, dense type for operational panels.
- Use panel headings and metric labels to create hierarchy.
- Do not use oversized hero text inside tool surfaces.
- Keep object labels short on the canvas.

## Spacing

- Use consistent panel padding (`p-3`) and small control gaps (`gap-2`).
- Avoid nested cards. Cards should frame metrics, repeated items, or focused controls.
- Keep the canvas as the central workspace, not a decorative preview.

## Accessibility

- Every button must have a readable accessible name.
- Icon-only buttons must include `aria-label` and `title`.
- Workflow buttons should expose active state through `aria-current`.
- Form controls must have visible labels with units where relevant.
- Keyboard focus should be visible.
- Dialogs should support Escape-close and should avoid trapping focus incorrectly.
- Disabled controls need a tooltip/title explaining why.

## Debug / QA UX

- Debug / QA is a diagnostic drawer, not a primary workflow.
- The `?debug=true` URL flag should enable diagnostics without opening the drawer automatically.
- The drawer opens through the app-header Debug / QA button or `Ctrl+Shift+D`.
- Keep the drawer close button visible and keyboard reachable.
- Do not let the drawer silently intercept the app during normal testing; close it before interacting with controls underneath.
- Issue report export must be local-only and clearly labeled.
- Console/runtime errors should be visible in the panel, but users should still be able to recover or export diagnostics.

## Responsive Rules

- Desktop is the primary editing experience.
- Below desktop width, keep the workflow rail usable and show the larger-screen warning.
- Use responsive drawers for the Design toolbox and workflow side panels instead of letting critical controls disappear.
- Drawer buttons should be short, explicit, and reachable near the lower-right canvas edge.
- Drawers should close with Escape in future dialog hardening; for now they close through the visible close button or backdrop click.
- Do not remove essential actions without an alternative access path.
- Mouse wheel zoom, spacebar drag, middle/right drag pan, and Fit to Screen are baseline navigation behaviors and should not depend on Design workflow being active.

## Workflow Principles

- Prefer fewer visible actions and stronger context.
- Separate preview from apply for generated candidates.
- Keep experimental workflows visibly labeled.
- Avoid placeholder buttons in main workflows. If a feature is not ready, hide or disable it with a clear explanation.
- Analytics should help the user decide what to fix next, not just dump numbers.
# 2026-05-14 Direction Tool Semantics

Rotation is no longer presented as a placed resource. The Design toolbox should keep rotation configuration under Traffic/Direction properties:

- select Direction tool
- click a traversable cell
- set movement directions
- enable or disable rack rotation
- choose supported orientations, dwell time, and capacity

Do not reintroduce a visible "Add rotation zone" workflow unless the model changes again.

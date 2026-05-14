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

## Component Usage

- Use `.toolbar-button-primary` for the primary action in a workflow.
- Use `.toolbar-button` for secondary actions.
- Use `.icon-button` only when the icon is familiar and there is a clear `aria-label` and `title`.
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

## Responsive Rules

- Desktop is the primary editing experience.
- Below desktop width, keep the workflow rail usable and show the larger-screen warning.
- Do not remove essential actions without an alternative access path.
- Future work should convert side panels to drawers below 1024 px.

## Workflow Principles

- Prefer fewer visible actions and stronger context.
- Separate preview from apply for generated candidates.
- Keep experimental workflows visibly labeled.
- Avoid placeholder buttons in main workflows. If a feature is not ready, hide or disable it with a clear explanation.
- Analytics should help the user decide what to fix next, not just dump numbers.

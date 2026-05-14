# Small Demo And Canvas Navigation

## Demo Presets

Small Demo is the default first-load layout. It is intentionally compact:

- `22 x 30` grid
- `1.2 m x 1.2 m` cells
- 3 stations
- 2 chargers
- 4 parking spots
- rotation zones near station approaches
- sample rack-bin SKU inventory
- small simulation defaults

Large Demo keeps the earlier `40 x 60` stress layout available for dense-layout checks without overwhelming first-time users.

## Canvas View Controls

The floating canvas control cluster is visible in Design, Generate, Analyze, Simulate Experimental, and Files workflows.

Controls:

- Fit to screen
- Reset view
- Zoom out
- Zoom in
- Toggle grid
- Toggle labels
- Toggle direction arrows
- Toggle heatmap

Fit to Screen calculates scale from actual canvas size, grid rows/columns, cell pixel size, and padding. It no longer uses a hardcoded zoom value.

## Mouse And Trackpad Navigation

- Mouse wheel / trackpad wheel: zoom around the pointer.
- Spacebar + left drag: pan.
- Middle mouse drag: pan.
- Right mouse drag: pan.
- Pan tool: pan.

Zoom is clamped between `0.2x` and `4.0x`.

## Verification

Verified commands:

- `npm run build`
- `npm test -- --run`
- `npm run test:e2e -- --workers=1`

Playwright now checks that view controls remain visible across workflows, wheel zoom changes the zoom value, and space-drag pan changes the stage position.

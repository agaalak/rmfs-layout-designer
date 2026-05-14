# Architecture Review

Date: 2026-05-14

This review focuses on module boundaries, correctness risk, and next refactors. The current pass added observability and invariants without destabilizing the working layout editor.

## Current Module Boundaries

| Area | Current Files | Status | Notes |
|---|---|---|---|
| Layout model | `src/models/layout.ts`, `grid.ts`, `rack.ts`, `station.ts`, `storage.ts` | Good | Domain records are explicit and versioned enough for current import/export. |
| Canvas rendering | `src/components/canvas/*` | Acceptable | Konva layers are separated, but `LayoutCanvas.tsx` still owns many interactions. |
| Workflow shell | `src/components/layout/*`, `src/components/panels/*` | Good | Workflow rail/context panels cleaned up previous toolbar overload. |
| Validation | `src/validation/*` | Good | Pure logic remains mostly separate from React. |
| Analytics | `src/analytics/*` | Good | Topic modules are separate; graph reuse can improve. |
| Import/export | `src/importExport/*` | Good | JSON/image/report exports are separated. |
| Simulation domain | `src/models/robot.ts`, `simulation.ts`, `task.ts`, `operationalTask.ts`, `order.ts` | Good foundation | Types are explicit and testable. |
| Controllers | `src/simulation/controllers/*` | Improved | Registry and decision trace now make strategies inspectable. |
| Path/traffic/collision | `pathPlanner.ts`, `reservationTable.ts`, `trafficController.ts`, `collisionEnvelope.ts`, `collisionRuntime.ts`, `deadlockDetector.ts` | Improved | Responsibility separation is reasonable for pre-MAPF traffic. |
| Simulation engine | `src/simulation/simulationEngine.ts` | Needs refactor | It orchestrates too many lifecycle concerns. |
| Simulation UI | `src/components/panels/SimulationPanel.tsx` | Needs refactor | Tabs/sections are logical but file size and responsibility are broad. |
| Debug/QA | `src/debug/*`, `src/components/debug/*` | Good | Separate from core logic and store-driven. |

## Oversized / High-Risk Files

### `src/simulation/simulationEngine.ts`

Risks:

- task assignment, route progression, rack lifecycle, station service, inventory updates, metrics, deadlock handling, and controller logging live in one file
- harder to reason about state transitions and invariants
- future WHCA/MAPF work will increase complexity

Recommended split:

- `simulationLifecycle.ts`
- `taskAssignment.ts`
- `robotStateMachine.ts`
- `rackLifecycle.ts`
- `stationService.ts`
- `simulationMetrics.ts`
- `simulationEvents.ts`

### `src/components/panels/SimulationPanel.tsx`

Risks:

- setup, orders/inventory, controllers, traffic, tasks, robots, stations, event log, exports, and readiness share one component
- harder to test individual panels

Recommended split:

- `SimulationOverviewPanel`
- `OrdersInventoryPanel`
- `ControllersPanel`
- `TrafficControlPanel`
- `TasksPanel`
- `RobotsPanel`
- `StationsPanel`
- `EventLogPanel`
- `SimulationExportsPanel`

### `src/components/canvas/LayoutCanvas.tsx`

Risks:

- navigation, tool painting, selection, object movement, keyboard shortcuts, and view controls are tightly coupled

Recommended split:

- `useCanvasNavigation`
- `useCanvasInteractions`
- `useCanvasSelection`
- `useCanvasDrawing`
- keep `CanvasViewControls` isolated

## Refactors Done In This Pass

- Added `src/debug/*` as a separate observability layer.
- Added top-level `ErrorBoundary` instead of letting render failures blank the app.
- Added `src/simulation/invariants.ts` as pure simulation validation logic.
- Added `src/simulation/controllers/controllerRegistry.ts` so controller metadata and decision traces are not embedded only in UI copy.
- Added performance capture helpers without coupling them directly to React components.

## Mutation And State Notes

- Zustand remains the central app state layer.
- Simulation state updates still rely on whole-state object replacement in store actions.
- Hot simulation loops should avoid unnecessary deep clones in future refactors.
- Invariants now provide a guardrail for catching accidental mutation bugs.

## Recommended Next Refactor Order

1. Split `simulationEngine.ts` into lifecycle modules while keeping existing tests green.
2. Split `SimulationPanel.tsx` into tab components.
3. Extract canvas hooks from `LayoutCanvas.tsx`.
4. Introduce a layout revision/hash for graph, validation, and analytics memoization.
5. Add WHCA-style planner as a new module, not inside the current shortest-path planner.


# Traffic Control Audit

Date: 2026-05-14

## Commands Run

- `npm install` - passed
- `npm run build` - passed
- `npm test -- --run` - passed, 62 tests at baseline
- `npm run test:e2e -- --workers=1` - passed, 11 tests at baseline
- `npm run dev` - app reachable at `http://127.0.0.1:5174`
- In-app browser load of Simulation workflow - passed, no console warnings/errors on load

## Post-Pass Verification

- `npm run build` - passed.
- `npm test -- --run` - passed, 74 tests.
- `npm run test:e2e -- --workers=1` - passed, 15 browser tests with 0 skipped tests.
- Interactive canvas E2E coverage is active again for manual editing, Mode B, Hybrid, Simulation, view controls, wheel zoom, and pan.

## Source Files Inspected

- `src/models/simulation.ts`
- `src/models/robot.ts`
- `src/models/task.ts`
- `src/simulation/simulationEngine.ts`
- `src/simulation/reservationTable.ts`
- `src/simulation/pathPlanner.ts`
- `src/components/panels/SimulationPanel.tsx`
- `tests/simulation.test.ts`
- `tests/rmfs-operations.test.ts`
- `e2e/layout-editor.spec.ts`
- `src/simulation/collisionRuntime.ts`
- `src/simulation/scenarios/collisionScenarios.ts`

## Scenario Findings

### 1. Small Simple Scenario

Status: PARTIALLY WORKING

- Reproduction: existing E2E initializes the demo, generates tasks, steps until one simple operational task completes.
- Expected: 2 robots / 2 racks / 1 station / 2 orders complete without collision.
- Actual after this pass: one simple task cycle still completes in unit coverage; deterministic scenario-runner coverage now exercises multi-task setup without browser timing risk.
- Event-log quality: good for order/rack/station/service events, improved for traffic/resource conflicts.
- Likely files: `simulationEngine.ts`, `reservationTable.ts`, `scenarioRunner.ts` to be added.
- Priority: P1.

### 2. Single-Lane Conflict Scenario

Status: PARTIALLY WORKING

- Reproduction: current unit tests verify same-cell and edge-swap reservation conflicts.
- Expected: one robot waits, no edge-swap collision.
- Actual after this pass: reservation-table primitives catch vertex and edge-swap conflicts, and route dispatch now reserves loaded envelopes with bounded waits/replan counters. Runtime recovery is still conservative.
- Event-log quality: traffic conflicts, waits, and failed reservations are surfaced as structured events.
- Likely files: `reservationTable.ts`, `trafficController.ts`, `simulationEngine.ts`.
- Priority: P0.

### 3. Station Queue Scenario

Status: PARTIALLY WORKING

- Reproduction: existing unit tests cover FIFO service; generation and assignment check queue fullness before dispatch.
- Expected: queue length 2 is respected, excess work delayed or failed clearly.
- Actual after this pass: dispatch delay still exists and station queue resource-reservation primitives now exist. Full runtime queue-slot scheduling remains partial.
- Event-log quality: service start/end is logged; queue-capacity waits need clearer traffic/resource events.
- Likely files: `reservationTable.ts`, `simulationEngine.ts`, `SimulationPanel.tsx`.
- Priority: P0.

### 4. Rotation-Zone Conflict Scenario

Status: PARTIALLY WORKING

- Reproduction: current route planning can insert rotation-zone paths, but reservation records do not model rotation-zone capacity.
- Expected: capacity 1 by default; two loaded robots cannot rotate in the same zone at the same time.
- Actual after this pass: explicit rotation dwell now attempts capacity-1 rotation-zone reservations and waits/logs when a zone is busy. More complete scheduling across long horizons is still future work.
- Event-log quality: rotation enter/complete and rotation-zone busy events exist.
- Likely files: `reservationTable.ts`, `trafficController.ts`, `simulationEngine.ts`.
- Priority: P0.

### 5. Carried-Rack Footprint Scenario

Status: PARTIALLY WORKING

- Reproduction: current reservations support an optional static footprint offset, but engine does not use carried-rack envelopes for loaded travel.
- Expected: a 2x2 carried rack reserves and validates all occupied cells, not only robot center.
- Actual after this pass: loaded routes reserve carried-rack footprint cells, detect blocked/static-rack envelope overlaps, and expose a loaded-envelope canvas toggle. Swept geometry is cell-based, not continuous.
- Event-log quality: envelope conflicts now include explanatory messages.
- Likely files: `collisionEnvelope.ts`, `reservationTable.ts`, `simulationEngine.ts`, `RobotLayer.tsx`.
- Priority: P0.

### 6. Deadlock Scenario

Status: PARTIALLY WORKING

- Reproduction: no dedicated deadlock detector exists.
- Expected: one-cell corridor deadlocks are detected and reported instead of silently waiting.
- Actual after this pass: repeated conflict-pair and blocked-time detection exists, with conservative recovery that clears future reservations and marks a recovery robot blocked or waiting depending policy. Corridor-specific browser E2E is still future work.
- Event-log quality: deadlock detection and recovery events exist.
- Likely files: `deadlockDetector.ts`, `trafficController.ts`, `simulationEngine.ts`.
- Priority: P0.

### 7. Larger Generated Scenario

Status: PARTIALLY WORKING

- Reproduction: default demo with 10 robots/task generation loads and can complete at least one E2E task.
- Expected: 10 robots / 20 orders shows progress, no console errors, no impossible overlaps, and explained failures.
- Actual after this pass: no console errors in startup smoke, and traffic metrics now include conflicts, waits, replans, deadlocks, and resource reservations. Large browser scenarios remain unit/scenario-runner oriented until E2E stability is repaired.
- Event-log quality: operations and traffic diagnostics are both represented.
- Likely files: `scenarioRunner.ts`, `simulationEngine.ts`, `SimulationPanel.tsx`, tests.
- Priority: P1.

## User-Reported Stabilization Update - 2026-05-14

Commands verified after this follow-up:

- `npm run build` - passed.
- `npm test -- --run` - 74 tests passed.
- `npm run test:e2e -- --workers=1` - 15 browser tests passed, 0 skipped.

Changes made:

- Added runtime collision guard in `src/simulation/collisionRuntime.ts`.
- Integrated the guard into `stepSimulation` after robot motion and before lifecycle transitions.
- Added collision-prevented events and traffic diagnostics.
- Added deterministic collision scenarios in `src/simulation/scenarios/collisionScenarios.ts`.
- Re-enabled the interactive Playwright canvas suite by removing the global skip.
- Reduced the first-load demo to Small Demo and retained Large Demo separately.
- Added always-visible canvas controls and mouse wheel / spacebar / middle / right drag navigation.
- Added Simulation Readiness and Orders & Inventory fix actions.

Updated scenario status:

1. Small simple scenario: WORKING for one E2E task cycle on Small Demo.
2. Single-lane conflict scenario: WORKING in unit-level deterministic runtime guard coverage; richer browser scenario remains future work.
3. Station queue scenario: PARTIALLY WORKING; queue/service capacity is enforced in dispatch/resource logic, but advanced dispatch backpressure is still future work.
4. Rotation-zone conflict scenario: PARTIALLY WORKING; capacity reservation exists, broader multi-robot rotation scheduling remains future work.
5. Carried-rack footprint scenario: WORKING in unit coverage for 2x2 blocked-cell prevention; browser-level visual narrow-aisle scenario remains future work.
6. Deadlock scenario: PARTIALLY WORKING; repeated-conflict/blocked-time detection reports and recovers conservatively, not full MAPF recovery.
7. Larger generated scenario: PARTIALLY WORKING; Large Demo is available for stress checks, but high-count traffic can still block/fail conservatively.

Highest remaining gaps:

1. Add browser E2E scenarios for 2x2 carried racks in narrow aisles.
2. Improve local replan/backoff instead of repeated rollback when a route intersects a stationary robot spawn.
3. Add WHCA*-style rolling horizon planning after this conservative guard stays stable.
4. Improve traffic metrics per route segment and per congested resource.

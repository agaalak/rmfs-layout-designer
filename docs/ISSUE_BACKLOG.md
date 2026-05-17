# Issue Backlog

Date: 2026-05-14

This backlog collects correctness, architecture, performance, UX, testing, and observability issues found during the RAWSim-O/RMFS alignment and live QA pass. It is intentionally broader than a feature list.

Statuses: open, in progress, fixed, deferred.

## Simulation Correctness

| ID | Title | Severity | Status | Source / Repro | Expected | Actual / Risk | Likely Files | Proposed Fix | Tests |
|---|---|---:|---|---|---|---|---|---|---|
| SIM-P0-001 | Traffic control is not full MAPF | P0/P1 | deferred | Run dense robot/order scenarios | Collision/deadlock-free plans with bounded recovery | Current shortest-path + reservations can still block conservatively | `src/simulation/pathPlanner.ts`, `trafficController.ts` | Add WHCA-style rolling horizon before CBS | Scenario runner + E2E stress |
| SIM-P1-002 | Station dispatch serialized work behind one active task | P1 | fixed | Multiple orders to one pick station | Queue capacity, not active station task count, controls dispatch | Old gate made only one robot appear to run | `simulationEngine.ts`, `stationAssignmentController.ts` | Removed station active-task gate; added queue lane runtime reservations | `logic-algorithm-fixes.test.ts` |
| SIM-P1-005 | Station assignment read stale station queues | P1 | fixed | `shortest_queue` with live queue lanes and stale `waitingRobotIds` | Score queue lanes by occupied cells, lane reservations, and active service occupancy | Controller could prefer a busy station when `StationQueue` was stale | `stationAssignmentController.ts`, `queueLaneLifecycle.ts` | Use `queueLaneStates` as source of truth and derive legacy station queues mechanically | `stationAssignmentController.test.ts`, `queueLaneLifecycle.test.ts` |
| SIM-P0-006 | Multiple robots could stack on the same physical queue cell | P0 | fixed | Diagnostics showed two loaded robots on queue head `20,26` while station cell was occupied | Queue cells are physical waiting cells with exclusive occupancy | Queue reservations were abstract capacity and allowed robots to target/pass through occupied queue cells | `queueLaneLifecycle.ts`, `simulationEngine.ts`, `pathPlanner.ts` | Reserve only the queue entry cell for dispatch, advance queue occupants one ordered cell at a time, and expose reserved vs occupied cells in Debug / QA | `queueLaneLifecycle.test.ts`, `logic-algorithm-fixes.test.ts`, full E2E |
| SIM-P1-007 | Small Demo UI ignored layout-specific simulation config while generating tasks | P1 | fixed | Initialize Small Demo then generate tasks in UI | Task generation uses the same merged config used for initialization | Store initialized with merged config but left active config at global defaults | `simulationStore.ts`, `proceduralGenerator.ts` | Persist merged layout simulation config back into the simulation store during initialize | E2E simple simulation cycle |
| SIM-P1-003 | Invariant failures should optionally pause simulation | P1 | open | Force duplicate rack assignment in debug mode | Debug mode pauses or clearly gates continuation | Invariants log but do not always stop playback | `simulationStore.ts`, `invariants.ts` | Add config flag `pauseOnInvariantViolation` | Invariant pause test |
| SIM-P2-004 | Battery and charging lifecycle incomplete | P2 | deferred | Long simulation with chargers | Robots drain battery and choose chargers | Battery is mostly static | `robot.ts`, `chargingController.ts` | Add drain/charge policy after traffic stabilizes | Battery lifecycle tests |

## Robot Collision / Traffic

| ID | Title | Severity | Status | Source / Repro | Expected | Actual / Risk | Likely Files | Proposed Fix | Tests |
|---|---|---:|---|---|---|---|---|---|---|
| TRAF-P1-001 | Runtime guard lacks continuous swept geometry | P1 | open | Loaded rack turning near obstacle | No overlap along the swept path | Current check is cell-step based | `collisionRuntime.ts`, `collisionEnvelope.ts` | Add swept cell union per segment | Narrow-aisle loaded rack tests |
| TRAF-P1-002 | Deadlock recovery is conservative | P1 | open | One-cell corridor opposing robots | Backoff/replan to safe pocket when available | Recovery mostly clears reservations/marks blocked | `deadlockDetector.ts`, `trafficController.ts` | Add safe-wait-cell search | Deadlock recovery scenario |
| TRAF-P2-003 | Reservation horizon needs UI warning | P2 | open | Very low/high horizon values | Config warns when horizon is too short/long | Values can be confusing | `SimulationPanel.tsx` | Add inline readiness warning | Component test |
| TRAF-P1-004 | Runtime envelope checks ignored interpolated visual pose cells | P1 | fixed | Robot visually entered a cell before `currentCell` advanced | Collision guard catches visual cell overlap as well as completed logical cell overlap | Guard used only completed `currentCell`, missing some apparent overlaps | `collisionRuntime.ts` | Merge logical current-cell envelope with visual pose-cell envelope | `user-reported-fixes.test.ts` |

## Rack / Pod Lifecycle

| ID | Title | Severity | Status | Source / Repro | Expected | Actual / Risk | Likely Files | Proposed Fix | Tests |
|---|---|---:|---|---|---|---|---|---|---|
| RACK-P1-001 | Rack state transitions are distributed | P1 | open | Inspect `simulationEngine.ts` | Dedicated state machine owns transitions | Transition logic is spread across engine branches | `simulationEngine.ts` | Extract `rackLifecycle.ts` | Transition table tests |
| RACK-P1-002 | Home vs current storage policy needs clearer semantics | P1 | fixed | `nearest_available_storage` strategy | User can tell whether home changes | Runtime now updates current storage/cell while design home stays stable unless configured | `rackStorageController.ts`, `simulationEngine.ts`, docs | Added runtime current-cell updates and `updateRackHomeAfterReallocation` config | Storage strategy tests |
| RACK-P0-003 | Runtime rack visual snapped back to old design cell | P0 | fixed | Run nearest-available storage task to completion | Rack renders at runtime destination storage | Design ObjectLayer rendered `homeCell` during simulation | `LayoutCanvas.tsx`, `RuntimeRackLayer.tsx`, `rackRuntimeView.ts` | Render simulation racks from runtime state | Runtime rack render tests |

## Station Behavior

| ID | Title | Severity | Status | Source / Repro | Expected | Actual / Risk | Likely Files | Proposed Fix | Tests |
|---|---|---:|---|---|---|---|---|---|---|
| STN-P1-001 | Partial fulfillment is thin | P1 | open | Order quantity exceeds selected bin quantity | Order line becomes SHORT or selects additional rack | Current path is simple single-rack fulfillment | `inventory.ts`, `simulationEngine.ts` | Support multi-rack order lines | Shortage tests |
| STN-P2-002 | Pack/QC/buffer behavior is dwell-only | P2 | deferred | Use PACK/QC station | Correct workflow semantics by station type | Service does not model downstream process | `station.ts`, `simulationEngine.ts` | Add process-specific event hooks later | Station type tests |
| STN-P0-003 | Queue-head robot repeatedly attempted occupied station cell | P0 | fixed | Diagnostics `issue-report-20260516-165350.json` | Robot waits at queue head until station service cell is free | Collision guard repeatedly prevented entry and visual pose could remain partially overlapped | `simulationEngine.ts`, `collisionRuntime.ts` | Added station-entry hold and safe-cell rollback | Logic regression tests |

## Inventory / Order Behavior

| ID | Title | Severity | Status | Source / Repro | Expected | Actual / Risk | Likely Files | Proposed Fix | Tests |
|---|---|---:|---|---|---|---|---|---|---|
| INV-P1-001 | Reserved quantity should be globally audited | P1 | in progress | Generate overlapping orders | Reserved <= available per bin | Invariants now catch many violations; controller still simple | `invariants.ts`, `rackSelectionController.ts` | Expand reservation map by bin/order | Duplicate reservation tests |
| INV-P2-002 | Order waves and due times missing | P2 | deferred | Generate sample orders | Wave/due-time simulation options | Orders are immediate sample demand | `orderGeneration.ts` | Add wave generator later | Due-time tests |

## Path Planning / MAPF Readiness

| ID | Title | Severity | Status | Source / Repro | Expected | Actual / Risk | Likely Files | Proposed Fix | Tests |
|---|---|---:|---|---|---|---|---|---|---|
| PATH-P1-001 | Waypoints are derived, not persisted/editable | P1 | open | Import/export layout graph | Persisted graph/waypoint debugging | Graph is rebuilt from cells/resources | `graphBuilder.ts`, `layout.ts` | Add optional waypoint snapshot/debug export | Graph roundtrip tests |
| PATH-P1-002 | WHCA-style planner absent | P1 | deferred | Multi-robot corridor | Rolling time-window planning | Current reservation repair is local | `pathPlanner.ts`, `trafficController.ts` | Add MAPF-lite module next pass | WHCA scenario tests |
| PATH-P1-003 | Generic routing could use station cells as shortcuts | P1 | fixed | Shortest path across a station cell unrelated to task | Station cells are terminal service targets, not incidental pass-through nodes | Generic graph included station nodes by default | `graphBuilder.ts`, `pathPlanner.ts` | Added station routing context and blocked station cells for generic shortest path | `stationPassThroughPolicy.test.ts` |
| PATH-P1-004 | Nearest rack scoring used approach cells | P1 | fixed | Asymmetric service-cell vs approach-cell layout | Rack scoring matches execution: route to `podServiceCell` | Rack selection still called `rackApproachNodes` | `rackSelectionController.ts`, `pathPlanner.ts` | Score `nearest_rack_with_sku` with `findPathToRackServiceCell` | `rackSelectionController.test.ts` |

## Layout Generation

| ID | Title | Severity | Status | Source / Repro | Expected | Actual / Risk | Likely Files | Proposed Fix | Tests |
|---|---|---:|---|---|---|---|---|---|---|
| GEN-P2-001 | Flying-V remains experimental | P2 | deferred | Generate true Flying-V | Connected, scoreable, reliable family | Works visually but not stress-proven | `flyingVGenerator.ts` | Keep badge; add more candidates/tests later | Flying-V stress E2E |

## UI / UX

| ID | Title | Severity | Status | Source / Repro | Expected | Actual / Risk | Likely Files | Proposed Fix | Tests |
|---|---|---:|---|---|---|---|---|---|---|
| UX-P1-001 | Debug panel can block app if auto-opened | P1 | fixed | `/?debug=true` then click controls | Debug available but not obstructing until opened | Panel originally opened immediately | `debugStore.ts` | Default closed; open via toolbar/shortcut | Debug E2E |
| UX-P2-002 | Dialog/drawer focus trap needs hardening | P2 | open | Keyboard through drawers/dialogs | Escape/focus loop predictable | Some custom panels are not fully trapped | `components/dialogs/*`, panels | Add shared dialog primitive | A11y tests |

## Performance

| ID | Title | Severity | Status | Source / Repro | Expected | Actual / Risk | Likely Files | Proposed Fix | Tests |
|---|---|---:|---|---|---|---|---|---|---|
| PERF-P1-001 | Simulation engine remains large/hot | P1 | open | Long playback profile | State machine modules with measured step time | Engine branches are large | `simulationEngine.ts` | Split lifecycle modules | Unit regression |
| PERF-P1-002 | Event logs can grow during long sessions | P1 | fixed | Long simulation/debug session | Logs capped and exportable | Debug store now caps logs; sim event cap still needs monitoring | `debugStore.ts`, `simulationStore.ts` | Keep caps and performance samples | Log cap tests |

## Testing

| ID | Title | Severity | Status | Source / Repro | Expected | Actual / Risk | Likely Files | Proposed Fix | Tests |
|---|---|---:|---|---|---|---|---|---|---|
| TEST-P1-001 | Live QA debug needed browser coverage | P1 | fixed | Ctrl+Shift+D/report export | E2E proves panel and exports work | Added `debug-qa.spec.ts` | `e2e/debug-qa.spec.ts` | Keep in full E2E suite | Full E2E |
| TEST-P2-002 | Large stress tests are not routine | P2 | open | Large Demo, 20+ orders | Repeatable nightly/perf scenario | Full suite stays small for runtime | `scenarioRunner.ts` | Add optional stress script | Stress command |

## Debugging / Observability

| ID | Title | Severity | Status | Source / Repro | Expected | Actual / Risk | Likely Files | Proposed Fix | Tests |
|---|---|---:|---|---|---|---|---|---|---|
| DBG-P1-001 | Need live diagnostics while user tests | P1 | fixed | User reports issue while app running | Export actions/errors/state/simulation snapshot | Added Debug / QA panel and globals | `src/debug/*`, `DebugPanel.tsx` | Iterate from real reports | Debug E2E |
| DBG-P1-003 | Need queue/service decision inspection | P1 | fixed | User reports only one robot runs or station queue stalls | Debug panel explains queue occupancy, station admission, wait reason, and reservations | Previous debug export had raw state but no focused queue inspector | `diagnosticsExport.ts`, `DebugPanel.tsx`, `main.tsx` | Added queue-lane inspector, station admission trace, why-waiting trace, controller trace, reservation snippet globals | Debug panel smoke + unit diagnostics follow-up |
| DBG-P2-002 | Issue report screenshot capture is not yet embedded | P2 | open | Export issue report | Optional current screenshot included | Report exports state/logs but not screenshot binary | `diagnosticsExport.ts` | Add canvas/browser screenshot hook later | Report test |

## Modularity / Architecture

| ID | Title | Severity | Status | Source / Repro | Expected | Actual / Risk | Likely Files | Proposed Fix | Tests |
|---|---|---:|---|---|---|---|---|---|---|
| ARCH-P1-001 | `simulationEngine.ts` has too many responsibilities | P1 | open | Architecture review | Engine orchestrates modules; modules own behavior | File mixes assignment, route execution, service, metrics | `simulationEngine.ts` | Split into lifecycle modules | Existing simulation tests |
| ARCH-P1-003 | Queue/station lifecycle lacked isolated module | P1 | fixed | Inspect assignment/service code | Queue-lane lifecycle is testable independently | Queue logic lived inline in `simulationEngine.ts` | `simulationEngine.ts`, `src/simulation/lifecycle/*` | Added queue, station service, rack, and robot task lifecycle helpers | `queueLaneLifecycle.test.ts`, `rackLifecycle.test.ts` |
| ARCH-P1-002 | `SimulationPanel.tsx` is too broad | P1 | open | Architecture review | Focused tab components | Panel contains setup/orders/controllers/tasks/events | `SimulationPanel.tsx` | Split panel tabs | Component tests |

## Import / Export / Schema

| ID | Title | Severity | Status | Source / Repro | Expected | Actual / Risk | Likely Files | Proposed Fix | Tests |
|---|---|---:|---|---|---|---|---|---|---|
| SCHEMA-P1-001 | Simulation snapshot export should include invariant report | P1 | in progress | Export snapshot in debug mode | Snapshot says whether state is valid | Diagnostics bundle includes invariants/events, not a formal snapshot schema | `diagnosticsExport.ts`, `invariants.ts` | Add `invariantSummary` top-level | Diagnostics tests |

## Accessibility / Documentation

| ID | Title | Severity | Status | Source / Repro | Expected | Actual / Risk | Likely Files | Proposed Fix | Tests |
|---|---|---:|---|---|---|---|---|---|---|
| A11Y-P2-001 | Some icon-only/debug controls need focus review | P2 | open | Keyboard navigation | Visible focus and aria labels everywhere | Main controls covered; deeper panel review needed | UI components | Run axe/manual keyboard audit | A11y test |
| DOC-P1-001 | Docs must separate implemented vs experimental | P1 | fixed | README/status review | No overclaiming full MAPF/RAWSim-O parity | Updated docs now mark gaps and experimental scope | `docs/*`, `README.md` | Continue after each pass | Documentation review |
# Semantic Correction Backlog Update - 2026-05-14

Fixed:

- P0: Queue cells embedded in stations.
- P0: Station service could be reasoned about as queue-cell service.
- P0: Pickup/drop routes used approach-cell terminology and behavior.
- P0: Rotation modeled as a distinct cell type/runtime object.
- P0: Old import/export schema preserved wrong queue/rotation semantics.

Deferred:

- P1: Dedicated visual queue-lane editing/reordering beyond current generated/manual cell editing.
- P1: Richer post-drop egress visualization.
- P2: Full contextual graph preventing any unassigned station pass-through in every analytics/path-planning context.

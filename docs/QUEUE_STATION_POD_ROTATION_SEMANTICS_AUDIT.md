# Queue / Station / Pod / Rotation Semantics Audit

Date: 2026-05-14

Commands run:

- `npm run build` before and after fixes
- `npm test -- --run`
- `npm run test:e2e -- --workers=1`
- Browser QA at `http://127.0.0.1:5174`

Browser QA result:

- App title loaded as `RMFS Layout Designer`.
- Canvas was visible.
- Status bar reported `Workflow: design`, `Mode: design`, and `Validation errors 0`.
- Browser warning/error log was empty during load.

## Findings

| Area | Previous Behavior | Corrected Behavior | Severity | Files |
|---|---|---|---|---|
| Queue semantics | Stations owned `queueCells`; generated queues could be treated as station appendages. | `QueueLane` is now first-class. Queue cells are ordered, directional waiting cells linked to but detached from station cells. | P0 | `src/models/station.ts`, `src/models/queue.ts`, `src/utils/queueLanes.ts`, `src/generators/proceduralGenerator.ts` |
| Station semantics | Routing could target station plus queue cells, and service logic did not strongly require the robot to be on `station.cell`. | Station routing targets the actual service cell. Service start checks `robot.currentCell === station.cell`. | P0 | `src/graph/graphBuilder.ts`, `src/simulation/pathPlanner.ts`, `src/simulation/simulationEngine.ts` |
| Pod/rack pickup/drop | Path naming and parts of logic still treated adjacent rack approach cells as pickup/drop targets. | Rack task routing now ends at `StorageLocation.podServiceCell`; lift/drop transitions validate robot is on that cell. | P0 | `src/models/storage.ts`, `src/simulation/pathPlanner.ts`, `src/simulation/simulationEngine.ts`, `src/simulation/collisionRuntime.ts` |
| Rotation semantics | `ROTATION` was a cell type and `RotationZone` objects were active runtime resources. | Rotation is a `LayoutCell` property: `allowRotation`, supported orientations, dwell time, capacity, and allowed rack types. Old rotation zones migrate to cell properties. | P0 | `src/models/grid.ts`, `src/utils/layoutSemantics.ts`, `src/store/layoutStore.ts`, `src/components/layout/RightPropertiesPanel.tsx` |
| Direction tool | Rotation was exposed as a resource placement tool. | Rotation is configured through the Traffic/Direction cell properties. The visible rotation placement tool was removed from the toolbox. | P1 | `src/components/layout/LeftToolbox.tsx`, `src/components/layout/RightPropertiesPanel.tsx`, `e2e/layout-editor.spec.ts` |
| Import/export | Schema `0.2.0` kept old queue/rotation assumptions. | Schema is bumped to `0.3.0`; import migrates legacy station queues, rotation zones, and storage pod service cells. | P0 | `src/importExport/importLayout.ts`, `src/importExport/exportLayout.ts`, `src/utils/layoutSemantics.ts` |
| Validation | Validation allowed old rotation-cell semantics and did not validate queue lane order strongly enough. | Validation flags legacy `ROTATION` cells, validates queue lanes, storage pod service cells, and rotation-enabled cell properties. | P0 | `src/validation/validateObjects.ts`, `src/validation/validateOrientation.ts`, `src/validation/validateConnectivity.ts` |

## Verification

- Unit tests: `14 passed`, `88 passed`.
- E2E tests: `18 passed`.
- Build: passed.

## Remaining Limitations

- Station cells are protected by simulation state and resource reservations, but the base graph is still a pragmatic grid graph rather than a full contextual resource graph.
- Post-drop egress is represented through route planning and collision checks, but richer dedicated egress visualization remains backlog.
- Simulation Mode remains Experimental; this pass corrects semantics but does not add WHCA*/CBS/MAPF.


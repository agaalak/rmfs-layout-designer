import type { useLayoutStore } from "../store/layoutStore";
import type { useSimulationStore } from "../store/simulationStore";
import type { useUiStore } from "../store/uiStore";
import type { WarehouseLayout } from "../models/layout";
import type { SimulationState } from "../models/simulation";
import type { DebugEvent } from "./debugEvents";
import { useDebugStore } from "./debugStore";
import { cellKey } from "../utils/gridMath";
import { trafficOccupancySnapshot } from "../simulation/trafficMoveGate";

export interface DiagnosticsBundle {
  generatedAt: string;
  appVersion: string;
  userAgent?: string;
  location?: string;
  layout: unknown;
  simulation: unknown;
  ui: unknown;
  debug: {
    events: unknown[];
    performanceSamples: unknown[];
    invariantViolationCount: number;
  };
  runtimeInspectors: RuntimeInspectors;
}

export interface RuntimeInspectors {
  queuePoints: Array<{
    queuePointId: string;
    cell: string;
    stationIds: string[];
    appliesToAllStations: boolean;
    waitPolicy: string;
    occupiedRobotId?: string;
    occupiedTaskId?: string;
    reservedRobotIds: string[];
    reservedTaskIds: string[];
    capacity: number;
  }>;
  queueLanes: Array<{
    queueLaneId: string;
    stationId: string;
    cells: Array<{ queueIndex: number; cell: string; robotId?: string; taskId?: string; reservedRobotId?: string; reservedTaskId?: string }>;
    reservedRobotIds: string[];
    reservedTaskIds: string[];
    activeHeadRobotId?: string;
  }>;
  stationAdmission: Array<{
    stationId: string;
    stationCell: string;
    activeRobotId?: string;
    activeRackId?: string;
    serviceEndTimeSec?: number;
    readyRobotIds: string[];
    queueLaneIds: string[];
  }>;
  controllerDecisionTrace: unknown[];
  whyWaiting: Array<{
    robotId: string;
    state: string;
    taskId?: string;
    waitingReason?: string;
    conflictTarget?: string;
    queueLaneId?: string;
    stationId?: string;
    activeStationRobotId?: string;
  }>;
  reservationTimeline: Array<{
    timeStep: number;
    robotId?: string;
    taskId?: string;
    resourceId?: string;
    kind?: string;
    cells?: string[];
  }>;
  trafficOccupancy: Array<{
    cell: string;
    ownerId: string;
    robotId?: string;
    taskId?: string;
    kind: string;
  }>;
  moveIntents: Array<{
    timeSec: number;
    robotId: string;
    fromCell: string;
    toCell: string;
    granted: boolean;
    reason?: string;
    conflictTarget?: string;
  }>;
}

export function createRuntimeInspectors(layout: WarehouseLayout, simulation: SimulationState): RuntimeInspectors {
  const queuePoints = (layout.queuePoints ?? []).map((point) => {
    const runtime = simulation.queuePointStates?.[point.queuePointId];
    return {
      queuePointId: point.queuePointId,
      cell: cellKey(point.cell),
      stationIds: point.stationIds,
      appliesToAllStations: point.appliesToAllStations,
      waitPolicy: point.waitPolicy,
      occupiedRobotId: runtime?.occupiedRobotId,
      occupiedTaskId: runtime?.occupiedTaskId,
      reservedRobotIds: runtime?.reservedRobotIds ?? [],
      reservedTaskIds: runtime?.reservedTaskIds ?? [],
      capacity: runtime?.capacity ?? point.capacity
    };
  });
  const queueLanes = (layout.queueLanes ?? []).map((lane) => {
    const runtime = simulation.queueLaneStates[lane.queueLaneId];
    const cells = (runtime?.occupiedCells ?? lane.cells.map((item) => ({ queueIndex: item.queueIndex, cell: item.cell }))).map((cell) => ({
      queueIndex: cell.queueIndex,
      cell: cellKey(cell.cell),
      robotId: cell.robotId,
      taskId: cell.taskId,
      reservedRobotId: cell.reservedRobotId,
      reservedTaskId: cell.reservedTaskId
    }));
    return {
      queueLaneId: lane.queueLaneId,
      stationId: lane.stationId,
      cells,
      reservedRobotIds: runtime?.reservedRobotIds ?? [],
      reservedTaskIds: runtime?.reservedTaskIds ?? [],
      activeHeadRobotId: runtime?.activeHeadRobotId
    };
  });

  const stationAdmission = layout.stations.map((station) => {
    const runtime = simulation.stationStates[station.id];
    const queue = simulation.stationQueues.find((item) => item.stationId === station.id);
    return {
      stationId: station.id,
      stationCell: cellKey(station.cell),
      activeRobotId: runtime?.activeRobotId ?? queue?.activeRobotId,
      activeRackId: runtime?.activeRackId,
      serviceEndTimeSec: runtime?.serviceEndTimeSec ?? queue?.serviceEndTimeSec,
      readyRobotIds: simulation.robots
        .filter((robot) => {
          const task = robot.assignedTaskId ? simulation.tasks.find((item) => item.taskId === robot.assignedTaskId) : undefined;
          return robot.state === "QUEUING_AT_STATION" && task?.stationId === station.id && cellKey(robot.currentCell) === cellKey(station.cell);
        })
        .map((robot) => robot.robotId),
      queueLaneIds: station.queueLaneIds
    };
  });

  const whyWaiting = simulation.robots
    .filter((robot) => robot.waitingReason || robot.blockedReason || robot.conflictTarget)
    .map((robot) => {
      const task = robot.assignedTaskId ? simulation.tasks.find((item) => item.taskId === robot.assignedTaskId) : undefined;
      const stationId = task?.stationId;
      return {
        robotId: robot.robotId,
        state: robot.state,
        taskId: robot.assignedTaskId,
        waitingReason: robot.waitingReason ?? robot.blockedReason,
        conflictTarget: robot.conflictTarget,
        queueLaneId: task?.queuePointId ?? task?.queueLaneId,
        stationId,
        activeStationRobotId: stationId ? simulation.stationStates[stationId]?.activeRobotId ?? simulation.stationQueues.find((queue) => queue.stationId === stationId)?.activeRobotId : undefined
      };
    });

  const reservationTimeline = Object.entries(simulation.reservationTable.reservedResources ?? {})
    .flatMap(([timeStep, records]) =>
      records.map((record) => ({
        timeStep: Number(timeStep),
        robotId: record.robotId,
        taskId: record.taskId,
        resourceId: record.resourceId,
        kind: record.kind,
        cells: (record.cells ?? (record.cell ? [record.cell] : [])).map(cellKey)
      }))
    )
    .sort((a, b) => a.timeStep - b.timeStep)
    .slice(-80);

  return {
    queuePoints,
    queueLanes,
    stationAdmission,
    controllerDecisionTrace: simulation.eventLog.filter((event) => event.entityType === "controller" || event.details?.controller).slice(-80),
    whyWaiting,
    reservationTimeline,
    trafficOccupancy: trafficOccupancySnapshot(layout, simulation).map((claim) => ({
      cell: cellKey(claim.cell),
      ownerId: claim.ownerId,
      robotId: claim.robotId,
      taskId: claim.taskId,
      kind: claim.kind
    })),
    moveIntents: (simulation.trafficDiagnostics.lastMoveIntents ?? []).map((intent) => ({
      ...intent,
      fromCell: cellKey(intent.fromCell),
      toCell: cellKey(intent.toCell)
    }))
  };
}

export function createDiagnosticsBundle(stores: {
  layout: typeof useLayoutStore;
  simulation: typeof useSimulationStore;
  ui: typeof useUiStore;
}): DiagnosticsBundle {
  const debug = useDebugStore.getState();
  const layoutState = stores.layout.getState();
  const simulationState = stores.simulation.getState();
  const uiState = stores.ui.getState();
  return {
    generatedAt: new Date().toISOString(),
    appVersion: "0.1.0",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    location: typeof window !== "undefined" ? window.location.href : undefined,
    layout: {
      selected: layoutState.selected,
      selectedCell: layoutState.selectedCell,
      present: layoutState.history.present
    },
    simulation: {
      config: simulationState.config,
      state: simulationState.state
    },
    ui: {
      activeTool: uiState.activeTool,
      appMode: uiState.appMode,
      workflow: uiState.workflow,
      zoom: uiState.zoom,
      hoverCell: uiState.hoverCell,
      showGrid: uiState.showGrid,
      showLabels: uiState.showLabels,
      showDirectionArrows: uiState.showDirectionArrows,
      showHeatmap: uiState.showHeatmap
    },
    debug: {
      events: debug.events,
      performanceSamples: debug.performanceSamples,
      invariantViolationCount: debug.invariantViolationCount
    },
    runtimeInspectors: createRuntimeInspectors(layoutState.history.present, simulationState.state)
  };
}

export function createIssueReport(
  stores: {
    layout: typeof useLayoutStore;
    simulation: typeof useSimulationStore;
    ui: typeof useUiStore;
  },
  fields: {
    title: string;
    description: string;
    expectedBehavior: string;
    actualBehavior: string;
    severity: string;
    category: string;
  }
) {
  const diagnostics = createDiagnosticsBundle(stores);
  const recentDebug = diagnostics.debug.events.slice(-100);
  const simState = stores.simulation.getState().state;
  return {
    ...fields,
    timestamp: diagnostics.generatedAt,
    appVersion: diagnostics.appVersion,
    userAgent: diagnostics.userAgent,
    currentUrl: diagnostics.location,
    recentDebug,
    recentSimulationEvents: simState.eventLog.slice(-100),
    layoutSnapshot: stores.layout.getState().history.present,
    simulationSnapshot: simState,
    note: "Screenshot capture is not embedded in this browser-only JSON export. Include a browser screenshot alongside this report when visual evidence is needed."
  };
}

export function issueReportMarkdown(report: ReturnType<typeof createIssueReport>) {
  return `# ${report.title || "RMFS Layout Designer Issue"}

- Severity: ${report.severity}
- Category: ${report.category}
- Timestamp: ${report.timestamp}
- App version: ${report.appVersion}
- URL: ${report.currentUrl ?? "unknown"}

## Description
${report.description || "_No description provided._"}

## Expected Behavior
${report.expectedBehavior || "_Not provided._"}

## Actual Behavior
${report.actualBehavior || "_Not provided._"}

## Recent Debug Events
${report.recentDebug
  .slice(-20)
  .map((event) => `- ${(event as { timestamp?: string; category?: string; severity?: string; message?: string }).timestamp} [${(event as { category?: string }).category}] ${(event as { message?: string }).message}`)
  .join("\n")}
`;
}

export function installDebugGlobals(stores: {
  layout: typeof useLayoutStore;
  simulation: typeof useSimulationStore;
  ui: typeof useUiStore;
}) {
  if (typeof window === "undefined") return;
  window.__RMFS_DEBUG__ = {
    getCurrentDiagnostics: () => createDiagnosticsBundle(stores),
    getRecentErrors: () => useDebugStore.getState().events.filter((event) => event.severity === "error").slice(-50),
    getRecentActions: () => useDebugStore.getState().events.filter((event) => event.category === "user_action").slice(-100),
    getSimulationSnapshot: () => stores.simulation.getState().state,
    getLayoutSnapshot: () => stores.layout.getState().history.present,
    getQueuePointInspector: () => createRuntimeInspectors(stores.layout.getState().history.present, stores.simulation.getState().state).queuePoints,
    getQueueLaneInspector: () => {
      const inspectors = createRuntimeInspectors(stores.layout.getState().history.present, stores.simulation.getState().state);
      return inspectors.queueLanes.length > 0 ? inspectors.queueLanes : inspectors.queuePoints;
    },
    getStationAdmissionTrace: () => createRuntimeInspectors(stores.layout.getState().history.present, stores.simulation.getState().state).stationAdmission,
    getControllerDecisionTrace: () => createRuntimeInspectors(stores.layout.getState().history.present, stores.simulation.getState().state).controllerDecisionTrace,
    getReservationTimeline: () => createRuntimeInspectors(stores.layout.getState().history.present, stores.simulation.getState().state).reservationTimeline,
    getTrafficOccupancy: () => createRuntimeInspectors(stores.layout.getState().history.present, stores.simulation.getState().state).trafficOccupancy,
    getMoveIntents: () => createRuntimeInspectors(stores.layout.getState().history.present, stores.simulation.getState().state).moveIntents,
    getDeniedMoves: () => createRuntimeInspectors(stores.layout.getState().history.present, stores.simulation.getState().state).moveIntents.filter((intent) => !intent.granted),
    getWhyWaiting: () => createRuntimeInspectors(stores.layout.getState().history.present, stores.simulation.getState().state).whyWaiting,
    exportDiagnostics: () => JSON.stringify(createDiagnosticsBundle(stores), null, 2),
    clearDiagnostics: () => useDebugStore.getState().clearDiagnostics(),
    enableVerboseMode: () => useDebugStore.getState().enableVerboseMode(),
    disableVerboseMode: () => useDebugStore.getState().disableVerboseMode()
  };
}

declare global {
  interface Window {
    __RMFS_DEBUG__?: {
      getCurrentDiagnostics: () => DiagnosticsBundle;
      getRecentErrors: () => unknown[];
      getRecentActions: () => unknown[];
      getSimulationSnapshot: () => unknown;
      getLayoutSnapshot: () => unknown;
      getQueuePointInspector: () => unknown[];
      getQueueLaneInspector: () => unknown[];
      getStationAdmissionTrace: () => unknown[];
      getControllerDecisionTrace: () => unknown[];
      getReservationTimeline: () => unknown[];
      getTrafficOccupancy: () => unknown[];
      getMoveIntents: () => unknown[];
      getDeniedMoves: () => unknown[];
      getWhyWaiting: () => unknown[];
      exportDiagnostics: () => string;
      clearDiagnostics: () => void;
      enableVerboseMode: () => void;
      disableVerboseMode: () => void;
    };
    __RMFS_DEBUG_RECORD__?: (event: Omit<DebugEvent, "eventId" | "timestamp"> & { eventId?: string; timestamp?: string }) => void;
  }
}

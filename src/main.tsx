import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { useLayoutStore } from "./store/layoutStore";
import { useSimulationStore } from "./store/simulationStore";
import { useUiStore } from "./store/uiStore";
import { installErrorCapture } from "./debug/errorCapture";
import { installQaSessionRecorder } from "./debug/qaSessionRecorder";
import { createRuntimeInspectors, installDebugGlobals } from "./debug/diagnosticsExport";
import { recordDebugEvent } from "./debug/debugStore";

declare global {
  interface Window {
    __RMFS_TEST__?: {
      layout: typeof useLayoutStore;
      ui: typeof useUiStore;
      simulation: typeof useSimulationStore;
      getQueueLaneInspector?: () => unknown[];
      getStationAdmissionTrace?: () => unknown[];
      getWhyWaiting?: () => unknown[];
      getTrafficOccupancy?: () => unknown[];
      getMoveIntents?: () => unknown[];
      getDeniedMoves?: () => unknown[];
    };
  }
}

const debugEnabled = import.meta.env.DEV || new URLSearchParams(window.location.search).get("debug") === "true";

if (debugEnabled) {
  window.__RMFS_TEST__ = {
    layout: useLayoutStore,
    ui: useUiStore,
    simulation: useSimulationStore,
    getQueueLaneInspector: () => createRuntimeInspectors(useLayoutStore.getState().history.present, useSimulationStore.getState().state).queueLanes,
    getStationAdmissionTrace: () => createRuntimeInspectors(useLayoutStore.getState().history.present, useSimulationStore.getState().state).stationAdmission,
    getWhyWaiting: () => createRuntimeInspectors(useLayoutStore.getState().history.present, useSimulationStore.getState().state).whyWaiting,
    getTrafficOccupancy: () => createRuntimeInspectors(useLayoutStore.getState().history.present, useSimulationStore.getState().state).trafficOccupancy,
    getMoveIntents: () => createRuntimeInspectors(useLayoutStore.getState().history.present, useSimulationStore.getState().state).moveIntents,
    getDeniedMoves: () => createRuntimeInspectors(useLayoutStore.getState().history.present, useSimulationStore.getState().state).moveIntents.filter((intent) => !intent.granted)
  };
  window.__RMFS_DEBUG_RECORD__ = recordDebugEvent;
  installDebugGlobals({ layout: useLayoutStore, ui: useUiStore, simulation: useSimulationStore });
  installErrorCapture(() => {
    const layoutState = useLayoutStore.getState();
    const uiState = useUiStore.getState();
    const simState = useSimulationStore.getState().state;
    return {
      workflow: uiState.workflow,
      activeTool: uiState.activeTool,
      selectedObjectId: layoutState.selected[0]?.id,
      selectedCell: layoutState.selectedCell ? `${layoutState.selectedCell.row},${layoutState.selectedCell.col}` : undefined,
      layoutId: layoutState.history.present.layoutId,
      simulationTimeSec: simState.simTimeSec,
      activeRobotId: simState.robots.find((robot) => robot.assignedTaskId)?.robotId,
      activeTaskId: simState.tasks.find((task) => task.status === "IN_PROGRESS" || task.status === "ASSIGNED")?.taskId
    };
  });
  installQaSessionRecorder({ layout: useLayoutStore, ui: useUiStore, simulation: useSimulationStore });
  window.setTimeout(() => installDebugGlobals({ layout: useLayoutStore, ui: useUiStore, simulation: useSimulationStore }), 0);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

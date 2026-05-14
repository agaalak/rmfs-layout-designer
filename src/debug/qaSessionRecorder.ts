import type { useLayoutStore } from "../store/layoutStore";
import type { useSimulationStore } from "../store/simulationStore";
import type { useUiStore } from "../store/uiStore";
import { recordDebugAction, recordDebugEvent } from "./debugStore";

let installed = false;

export function installQaSessionRecorder(stores: {
  layout: typeof useLayoutStore;
  simulation: typeof useSimulationStore;
  ui: typeof useUiStore;
}) {
  if (installed) return;
  installed = true;

  let previousUi = stores.ui.getState();
  stores.ui.subscribe((state) => {
    if (state.workflow !== previousUi.workflow) recordDebugAction("workflow.change", `Workflow changed to ${state.workflow}`, { from: previousUi.workflow, to: state.workflow });
    if (state.activeTool !== previousUi.activeTool) recordDebugAction("tool.change", `Tool changed to ${state.activeTool}`, { from: previousUi.activeTool, to: state.activeTool });
    if (state.zoom !== previousUi.zoom) recordDebugAction("canvas.zoom", `Canvas zoom changed to ${(state.zoom * 100).toFixed(0)}%`, { zoom: state.zoom });
    previousUi = state;
  });

  let previousLayout = stores.layout.getState();
  stores.layout.subscribe((state) => {
    const layout = state.history.present;
    const oldLayout = previousLayout.history.present;
    if (layout.layoutId !== oldLayout.layoutId) recordDebugAction("layout.change", `Layout changed to ${layout.name}`, { layoutId: layout.layoutId, mode: layout.mode });
    if (layout.racks.length !== oldLayout.racks.length) recordDebugAction("layout.racks", `Rack count changed to ${layout.racks.length}`, { racks: layout.racks.length });
    if (layout.stations.length !== oldLayout.stations.length) recordDebugAction("layout.stations", `Station count changed to ${layout.stations.length}`, { stations: layout.stations.length });
    if (state.selected[0]?.id !== previousLayout.selected[0]?.id) recordDebugAction("selection.change", `Selected ${state.selected[0]?.id ?? "none"}`, { selected: state.selected[0] });
    previousLayout = state;
  });

  let previousSimulation = stores.simulation.getState();
  stores.simulation.subscribe((state) => {
    const oldState = previousSimulation.state;
    const nextState = state.state;
    if (nextState.initialized !== oldState.initialized) recordDebugAction("simulation.initialize", nextState.initialized ? "Simulation initialized" : "Simulation reset");
    if (nextState.isRunning !== oldState.isRunning) recordDebugAction("simulation.playback", nextState.isRunning ? "Simulation playback started" : "Simulation playback paused");
    if (nextState.tasks.length !== oldState.tasks.length) recordDebugAction("simulation.tasks", `Simulation task count is ${nextState.tasks.length}`, { tasks: nextState.tasks.length });
    if (nextState.eventLog.length > oldState.eventLog.length) {
      for (const event of nextState.eventLog.slice(oldState.eventLog.length)) {
        const category = event.entityType === "traffic" || event.entityType === "deadlock" ? "traffic" : event.entityType === "controller" ? "controller" : "simulation";
        recordDebugEvent({
          category,
          severity: event.severity === "error" ? "error" : event.severity === "warning" ? "warning" : "info",
          message: event.message,
          source: "simulation.eventLog",
          context: { simulationTimeSec: event.timeSec, activeRobotId: event.robotId, activeTaskId: event.taskId },
          details: event.details
        });
      }
    }
    previousSimulation = state;
  });
}

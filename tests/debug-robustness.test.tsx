import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { ErrorBoundary } from "../src/components/debug/ErrorBoundary";
import { createDiagnosticsBundle } from "../src/debug/diagnosticsExport";
import { useDebugStore } from "../src/debug/debugStore";
import { generateSmallDemoLayout } from "../src/generators/proceduralGenerator";
import { useLayoutStore } from "../src/store/layoutStore";
import { useSimulationStore } from "../src/store/simulationStore";
import { useUiStore } from "../src/store/uiStore";
import { getControllerStrategyDescription } from "../src/simulation/controllers/controllerRegistry";
import { checkSimulationInvariants } from "../src/simulation/invariants";
import { initializeSimulation } from "../src/simulation/simulationEngine";
import { defaultSimulationConfig } from "../src/models/simulation";

function ThrowingComponent() {
  throw new Error("debug boundary test");
  return null;
}

describe("debug and robustness instrumentation", () => {
  beforeEach(() => {
    useDebugStore.getState().clearDiagnostics();
  });

  it("records debug errors, actions, and performance samples", () => {
    useDebugStore.getState().recordError("Console-style failure", "console.error");
    useDebugStore.getState().recordAction("tool.change", "Tool changed to rack");
    useDebugStore.getState().recordPerformance("simulation.step", 120, { robots: 4 });
    const state = useDebugStore.getState();
    expect(state.events.some((event) => event.message.includes("Console-style failure"))).toBe(true);
    expect(state.events.some((event) => event.category === "user_action")).toBe(true);
    expect(state.performanceSamples[0].name).toBe("simulation.step");
  });

  it("exports diagnostics with layout, simulation, ui, and debug data", () => {
    const layout = generateSmallDemoLayout();
    useLayoutStore.getState().setLayout(layout);
    useSimulationStore.getState().initialize(layout);
    useDebugStore.getState().recordAction("test.action", "Recorded test action");
    const bundle = createDiagnosticsBundle({ layout: useLayoutStore, simulation: useSimulationStore, ui: useUiStore });
    expect((bundle.layout as { present: { layoutId: string } }).present.layoutId).toBe(layout.layoutId);
    expect((bundle.simulation as { state: { initialized: boolean } }).state.initialized).toBe(true);
    expect(bundle.debug.events.length).toBeGreaterThan(0);
  });

  it("keeps user simulation config overrides when initialization applies layout defaults", () => {
    const layout = generateSmallDemoLayout();
    useSimulationStore.setState({ config: defaultSimulationConfig, configOverrides: {} });
    useSimulationStore.getState().setConfig({ taskCount: 4, robotCount: 3 });
    useSimulationStore.getState().initialize(layout);
    useSimulationStore.getState().generateTasks(layout);
    const state = useSimulationStore.getState().state;
    expect(useSimulationStore.getState().config.taskCount).toBe(4);
    expect(state.tasks).toHaveLength(4);
  });

  it("error boundary captures render errors into the debug store", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText(/render error/i)).toBeTruthy();
    expect(useDebugStore.getState().events.some((event) => event.source === "react.errorBoundary")).toBe(true);
  });

  it("detects robot envelope overlap and duplicate active rack assignment invariants", () => {
    const layout = generateSmallDemoLayout();
    const state = initializeSimulation(layout);
    state.robots[0].currentCell = { row: 1, col: 1 };
    state.robots[1].currentCell = { row: 1, col: 1 };
    state.tasks = [
      { taskId: "task_a", taskType: "PICK_ORDER", rackId: layout.racks[0].id, stationId: layout.stations[0].id, priority: 1, status: "ASSIGNED", createdAtSec: 0, robotId: state.robots[0].robotId },
      { taskId: "task_b", taskType: "PICK_ORDER", rackId: layout.racks[0].id, stationId: layout.stations[0].id, priority: 1, status: "IN_PROGRESS", createdAtSec: 0, robotId: state.robots[1].robotId }
    ];
    const issues = checkSimulationInvariants(layout, state);
    expect(issues.some((issue) => issue.invariantId === "robot.envelope_overlap")).toBe(true);
    expect(issues.some((issue) => issue.invariantId === "task.duplicate_active_rack")).toBe(true);
  });

  it("controller registry exposes strategy descriptions", () => {
    expect(getControllerStrategyDescription("nearest_idle_robot")).toContain("closest");
    expect(getControllerStrategyDescription("return_home")).toContain("original storage");
  });
});

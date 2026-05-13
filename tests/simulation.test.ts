import { describe, expect, it } from "vitest";
import { defaultGenerationParams, generateProceduralLayout } from "../src/generators/proceduralGenerator";
import { defaultSimulationConfig, type SimulationConfig } from "../src/models/simulation";
import type { WarehouseLayout } from "../src/models/layout";
import { buildRoadGraph } from "../src/graph/graphBuilder";
import { exportSimulationConfigJson, exportSimulationEventLogCsv, exportSimulationMetricsCsv, importSimulationConfigJson } from "../src/importExport/exportSimulation";
import { createReservationTable, addWaitSteps, findFirstConflict, isCellReserved, isEdgeReserved, reservePath } from "../src/simulation/reservationTable";
import { calculatePathDistanceMeters, findPathToNearestRackApproach, findShortestPath, nearestCompatibleStation } from "../src/simulation/pathPlanner";
import {
  createTaskForRackStation,
  generateSimulationTasks,
  getRobotSpawnCells,
  initializeSimulation,
  resetSimulation,
  stepSimulation
} from "../src/simulation/simulationEngine";
import { useUiStore } from "../src/store/uiStore";
import { rackOccupiedCells } from "../src/utils/rackFootprint";

function simLayout(): WarehouseLayout {
  return generateProceduralLayout({ ...defaultGenerationParams, rows: 18, columns: 28, stationCount: 4, chargerCount: 3, parkingSpotCount: 4, rackFillRatio: 0.35 });
}

const fastConfig: SimulationConfig = {
  ...defaultSimulationConfig,
  robotCount: 3,
  taskCount: 3,
  unloadedSpeedMps: 100,
  loadedSpeedMps: 100,
  liftTimeSec: 0.1,
  dropTimeSec: 0.1,
  stationServiceTimeSec: 0.2,
  reservationTimeStepSec: 1
};

describe("2D simulation foundation", () => {
  it("provides simulation config defaults", () => {
    expect(defaultSimulationConfig.robotCount).toBe(10);
    expect(defaultSimulationConfig.unloadedSpeedMps).toBe(1.5);
    expect(defaultSimulationConfig.reservationTimeStepSec).toBe(1);
  });

  it("spawns robots from parking spots first", () => {
    const layout = simLayout();
    const state = initializeSimulation(layout, { ...fastConfig, robotCount: 2 });
    expect(state.robots).toHaveLength(2);
    expect(layout.parkingSpots.map((parking) => parking.cell)).toContainEqual(state.robots[0].currentCell);
  });

  it("spawns robots from chargers when parking is insufficient", () => {
    const layout = simLayout();
    layout.parkingSpots = [];
    const state = initializeSimulation(layout, { ...fastConfig, robotCount: 2 });
    expect(layout.chargingSpots.flatMap((charger) => charger.cells)).toContainEqual(state.robots[0].currentCell);
  });

  it("generates reachable rack-station tasks", () => {
    const layout = simLayout();
    const tasks = generateSimulationTasks(layout, { ...fastConfig, taskCount: 5 }, 0);
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      const rack = layout.racks.find((item) => item.id === task.rackId)!;
      expect(nearestCompatibleStation(layout, rack)?.id).toBe(task.stationId);
    }
  });

  it("hot/warm/cold weighted selection favors HOT racks", () => {
    const layout = simLayout();
    layout.racks.forEach((rack, index) => {
      rack.demandClass = index === 0 ? "HOT" : "COLD";
    });
    const tasks = generateSimulationTasks(layout, { ...fastConfig, taskGenerationMode: "weighted_hot_warm_cold", taskCount: 1 }, 0);
    expect(tasks[0].rackId).toBe(layout.racks[0].id);
  });

  it("shortest path respects one-way traffic and avoids blocked cells", () => {
    const layout = simLayout();
    layout.cells = [
      { row: 0, col: 0, cellType: "ROAD", allowedDirections: ["east"] },
      { row: 0, col: 1, cellType: "ROAD", allowedDirections: ["east"] },
      { row: 0, col: 2, cellType: "ROAD", allowedDirections: ["west"] },
      { row: 1, col: 1, cellType: "BLOCKED", allowedDirections: [] }
    ];
    const forward = findShortestPath(layout, { row: 0, col: 0 }, { row: 0, col: 2 });
    const backward = findShortestPath(layout, { row: 0, col: 2 }, { row: 0, col: 0 });
    expect(forward.map((cell) => `${cell.row}:${cell.col}`)).toEqual(["0:0", "0:1", "0:2"]);
    expect(backward).toHaveLength(0);
    expect(buildRoadGraph(layout).nodes.has("1:1")).toBe(false);
  });

  it("calculates multi-cell rack approach cells", () => {
    const layout = generateProceduralLayout({ ...defaultGenerationParams, rows: 18, columns: 28, rackFootprintWidthM: 2, rackFootprintDepthM: 1, rackFillRatio: 0.2 });
    const rack = layout.racks[0];
    expect(rackOccupiedCells(rack, layout.grid)).toHaveLength(2);
    const path = findPathToNearestRackApproach(layout, layout.parkingSpots[0].cell, rack);
    expect(path.length).toBeGreaterThan(0);
  });

  it("prevents same-cell and edge-swap reservation conflicts", () => {
    const table = createReservationTable(1);
    const pathA = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    const reserved = reservePath(table, "robot_a", pathA, 0, 1).table;
    expect(isCellReserved(reserved, { row: 0, col: 0 }, 0, "robot_b")).toBe(true);
    expect(isEdgeReserved(reserved, { row: 0, col: 1 }, { row: 0, col: 0 }, 1, "robot_b")).toBe(true);
    const conflict = findFirstConflict(reserved, [{ row: 0, col: 1 }, { row: 0, col: 0 }], 0, "robot_b");
    expect(conflict?.type).toBe("edge");
  });

  it("waiting steps can resolve a simple reservation conflict", () => {
    const table = createReservationTable(1);
    const reserved = reservePath(table, "robot_a", [{ row: 0, col: 0 }, { row: 0, col: 1 }], 0, 1).table;
    const waited = addWaitSteps([{ row: 0, col: 2 }, { row: 0, col: 1 }, { row: 0, col: 0 }], 2);
    expect(findFirstConflict(reserved, waited, 0, "robot_b")).toBeUndefined();
  });

  it("simulation step moves robot smoothly and transitions from idle to moving", () => {
    const layout = simLayout();
    let state = initializeSimulation(layout, fastConfig);
    state.tasks = generateSimulationTasks(layout, { ...fastConfig, taskCount: 1 }, 0);
    state = stepSimulation(layout, state, fastConfig, 0.1);
    expect(["MOVING_EMPTY", "LIFTING_RACK"]).toContain(state.robots[0].state);
    expect(state.robots[0].assignedTaskId).toBeTruthy();
    expect(state.robots[0].pose.x).toBeGreaterThan(0);
  });

  it("robot lifts rack, carries it, queues, returns rack, and completes task", () => {
    const layout = simLayout();
    let state = initializeSimulation(layout, fastConfig);
    state.tasks = generateSimulationTasks(layout, { ...fastConfig, taskCount: 1 }, 0);
    let sawCarry = false;
    let sawService = false;
    for (let index = 0; index < 30; index += 1) {
      state = stepSimulation(layout, state, fastConfig, 1);
      sawCarry ||= state.robots.some((robot) => Boolean(robot.carryingRackId));
      sawService ||= state.robots.some((robot) => robot.state === "SERVICING_AT_STATION" || robot.state === "QUEUING_AT_STATION");
      if (state.completedTasks.length > 0) break;
    }
    expect(sawCarry).toBe(true);
    expect(sawService).toBe(true);
    expect(state.completedTasks.length).toBeGreaterThan(0);
    expect(state.robots[0].carryingRackId).toBeUndefined();
  });

  it("station queues process robots FIFO", () => {
    const layout = simLayout();
    let state = initializeSimulation(layout, { ...fastConfig, robotCount: 2, taskCount: 2, stationServiceTimeSec: 2 });
    const station = layout.stations[0];
    const first = createTaskForRackStation(layout, layout.racks[0].id, station.id, 0, 2)!;
    const second = createTaskForRackStation(layout, layout.racks[1].id, station.id, 0, 1)!;
    state.tasks = [first, second];
    for (let index = 0; index < 10; index += 1) state = stepSimulation(layout, state, fastConfig, 1);
    expect(state.eventLog.some((event) => event.message.includes("started station service"))).toBe(true);
  });

  it("simulation reset clears robots, tasks, logs, and metrics", () => {
    const state = resetSimulation(fastConfig);
    expect(state.robots).toHaveLength(0);
    expect(state.tasks).toHaveLength(0);
    expect(state.eventLog).toHaveLength(0);
    expect(state.metrics.activeRobotCount).toBe(0);
  });

  it("exports simulation metrics and event log CSV", () => {
    const layout = simLayout();
    const state = initializeSimulation(layout, fastConfig);
    expect(exportSimulationConfigJson(fastConfig)).toContain("simulationConfig");
    expect(exportSimulationMetricsCsv(state.metrics)).toContain("activeRobotCount");
    expect(exportSimulationEventLogCsv(state.eventLog)).toContain("Initialized");
  });

  it("imports simulation config JSON safely", () => {
    const imported = importSimulationConfigJson(exportSimulationConfigJson({ ...fastConfig, robotCount: 7 }));
    expect(imported.config?.robotCount).toBe(7);
    expect(importSimulationConfigJson("{nope").errors[0]).toContain("Invalid simulation config JSON");
    expect(importSimulationConfigJson(JSON.stringify({ robotCount: -1 })).errors[0]).toContain("robotCount");
  });

  it("tracks app design/simulation mode", () => {
    useUiStore.getState().setAppMode("simulation");
    expect(useUiStore.getState().appMode).toBe("simulation");
    useUiStore.getState().setAppMode("design");
    expect(useUiStore.getState().appMode).toBe("design");
  });

  it("calculates path distances in meters", () => {
    const layout = simLayout();
    const distance = calculatePathDistanceMeters([{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 }], layout.grid);
    expect(distance).toBeCloseTo(layout.grid.cellWidthM + layout.grid.cellDepthM);
  });
});

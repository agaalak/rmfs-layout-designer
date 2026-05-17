import { describe, expect, it } from "vitest";
import { generateSmallDemoLayout } from "../../generators/proceduralGenerator";
import { defaultSimulationConfig } from "../../models/simulation";
import type { GridCell } from "../../models/grid";
import type { Robot } from "../../models/robot";
import { cellKey } from "../../utils/gridMath";
import { initializeSimulation } from "../simulationEngine";
import { applyTrafficMoveGate, trafficOccupancySnapshot } from "../trafficMoveGate";

function roadCellPair(layout = generateSmallDemoLayout()): [GridCell, GridCell] {
  const roads = layout.cells.filter((cell) => cell.cellType === "ROAD");
  for (const cell of roads) {
    const neighbor = roads.find((candidate) => Math.abs(candidate.row - cell.row) + Math.abs(candidate.col - cell.col) === 1);
    if (neighbor) return [cell, neighbor];
  }
  throw new Error("No adjacent road cells found in demo layout.");
}

function roadCellWithTwoNeighbors(layout = generateSmallDemoLayout()): [GridCell, GridCell, GridCell] {
  const roads = layout.cells.filter((cell) => cell.cellType === "ROAD");
  for (const target of roads) {
    const neighbors = roads.filter((candidate) => Math.abs(candidate.row - target.row) + Math.abs(candidate.col - target.col) === 1);
    if (neighbors.length >= 2) return [neighbors[0], target, neighbors[1]];
  }
  throw new Error("No road cell with two neighbors found in demo layout.");
}

function movingRobot(robot: Robot, currentCell: GridCell, targetCell: GridCell): Robot {
  return {
    ...robot,
    state: "MOVING_EMPTY",
    currentCell,
    pose: { x: currentCell.col + 0.5, y: currentCell.row + 0.5, yawDeg: 0 },
    currentPath: [currentCell, targetCell],
    routeIndex: 0,
    segmentProgressM: 0,
    pathProgress: 0,
    targetCell: undefined,
    assignedTaskId: undefined,
    carryingRackId: undefined
  };
}

describe("traffic move gate", () => {
  it("denies entry before a robot can share another robot current cell", () => {
    const layout = generateSmallDemoLayout();
    const [from, occupied] = roadCellPair(layout);
    const state = initializeSimulation(layout, { ...defaultSimulationConfig, robotCount: 2 });
    const gated = applyTrafficMoveGate(
      layout,
      {
        ...state,
        simTimeSec: 1,
        robots: [
          movingRobot(state.robots[0], from, occupied),
          { ...state.robots[1], state: "IDLE", currentCell: occupied, pose: { x: occupied.col + 0.5, y: occupied.row + 0.5, yawDeg: 0 }, currentPath: [] }
        ]
      },
      defaultSimulationConfig,
      1
    ).state;

    expect(cellKey(gated.robots[0].currentCell)).toBe(cellKey(from));
    expect(gated.robots[0].waitingReason).toContain("occupied or claimed");
    expect(gated.trafficDiagnostics.deniedMoveCount).toBe(1);
  });

  it("grants only one robot when two robots target the same empty cell", () => {
    const layout = generateSmallDemoLayout();
    const [a, target, b] = roadCellWithTwoNeighbors(layout);
    const state = initializeSimulation(layout, { ...defaultSimulationConfig, robotCount: 2 });
    const gated = applyTrafficMoveGate(
      layout,
      {
        ...state,
        simTimeSec: 1,
        robots: [movingRobot(state.robots[0], a, target), movingRobot(state.robots[1], b, target)]
      },
      defaultSimulationConfig,
      1
    ).state;
    const robotCells = gated.robots.map((robot) => cellKey(robot.currentCell));

    expect(new Set(robotCells).size).toBe(robotCells.length);
    expect(gated.trafficDiagnostics.deniedMoveCount).toBe(1);
    expect(gated.trafficDiagnostics.lastMoveIntents.filter((intent) => intent.granted)).toHaveLength(1);
  });

  it("denies edge swaps before either robot moves into the other current cell", () => {
    const layout = generateSmallDemoLayout();
    const [a, b] = roadCellPair(layout);
    const state = initializeSimulation(layout, { ...defaultSimulationConfig, robotCount: 2 });
    const gated = applyTrafficMoveGate(
      layout,
      {
        ...state,
        simTimeSec: 1,
        robots: [movingRobot(state.robots[0], a, b), movingRobot(state.robots[1], b, a)]
      },
      defaultSimulationConfig,
      1
    ).state;

    expect(cellKey(gated.robots[0].currentCell)).toBe(cellKey(a));
    expect(cellKey(gated.robots[1].currentCell)).toBe(cellKey(b));
    expect(gated.trafficDiagnostics.deniedMoveCount).toBe(2);
  });

  it("exposes occupancy claims for debug inspectors", () => {
    const layout = generateSmallDemoLayout();
    const [from, occupied] = roadCellPair(layout);
    const state = initializeSimulation(layout, { ...defaultSimulationConfig, robotCount: 2 });
    const claims = trafficOccupancySnapshot(layout, {
      ...state,
      robots: [
        movingRobot(state.robots[0], from, occupied),
        { ...state.robots[1], state: "IDLE", currentCell: occupied, pose: { x: occupied.col + 0.5, y: occupied.row + 0.5, yawDeg: 0 }, currentPath: [] }
      ]
    });

    expect(claims.some((claim) => claim.robotId === state.robots[0].robotId && cellKey(claim.cell) === cellKey(from))).toBe(true);
    expect(claims.some((claim) => claim.robotId === state.robots[1].robotId && cellKey(claim.cell) === cellKey(occupied))).toBe(true);
  });
});

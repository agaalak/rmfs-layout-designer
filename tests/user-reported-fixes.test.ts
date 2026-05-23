import { describe, expect, it } from "vitest";
import {
  createEmptyLayout,
  generateLargeDemoLayout,
  generateSmallDemoLayout,
  smallDemoGenerationParams,
  largeDemoGenerationParams
} from "../src/generators/proceduralGenerator";
import { applyCollisionGuard, detectRuntimeCollisions } from "../src/simulation/collisionRuntime";
import { runCollisionScenario } from "../src/simulation/scenarios/collisionScenarios";
import { generateOperationalSimulationWork, initializeSimulation, stepSimulation, validateSimulationStart } from "../src/simulation/simulationEngine";
import { inventoryFromLayout } from "../src/simulation/inventory";
import { defaultSimulationConfig } from "../src/models/simulation";
import { useLayoutStore } from "../src/store/layoutStore";
import { fitLayoutToCanvas, zoomAroundPointer } from "../src/utils/viewMath";
import { findPathToNearestRackApproach } from "../src/simulation/pathPlanner";
import { cellKey } from "../src/utils/gridMath";
import {
  deleteSavedLayout,
  getDefaultLayoutId,
  listSavedLayouts,
  loadDefaultSavedLayout,
  saveLayoutToBrowser,
  setDefaultLayoutId
} from "../src/importExport/layoutPersistence";

describe("user-reported stabilization fixes", () => {
  it("saves layouts in browser storage and optionally makes one the startup default", () => {
    localStorage.clear();
    const layout = { ...generateSmallDemoLayout(), layoutId: "layout_browser_saved_default", name: "Browser Saved Default" };

    const summary = saveLayoutToBrowser(layout, true);

    expect(summary.name).toBe("Browser Saved Default");
    expect(getDefaultLayoutId()).toBe("layout_browser_saved_default");
    expect(listSavedLayouts().map((item) => item.id)).toContain("layout_browser_saved_default");
    expect(loadDefaultSavedLayout()?.name).toBe("Browser Saved Default");

    deleteSavedLayout("layout_browser_saved_default");
    expect(getDefaultLayoutId()).toBeUndefined();
    expect(loadDefaultSavedLayout()).toBeUndefined();
  });

  it("can switch the startup default to an already saved layout", () => {
    localStorage.clear();
    const first = { ...generateSmallDemoLayout(), layoutId: "layout_saved_first", name: "Saved First" };
    const second = { ...generateSmallDemoLayout(), layoutId: "layout_saved_second", name: "Saved Second" };
    saveLayoutToBrowser(first, false);
    saveLayoutToBrowser(second, false);

    setDefaultLayoutId("layout_saved_second");

    expect(loadDefaultSavedLayout()?.layoutId).toBe("layout_saved_second");
  });

  it("small demo is smaller than the large stress demo and is simulation-ready", () => {
    const small = generateSmallDemoLayout();
    const large = generateLargeDemoLayout();
    expect(smallDemoGenerationParams.rows).toBeLessThan(largeDemoGenerationParams.rows);
    expect(smallDemoGenerationParams.columns).toBeLessThan(largeDemoGenerationParams.columns);
    expect(small.grid.rows).toBeLessThanOrEqual(24);
    expect(small.grid.columns).toBeLessThanOrEqual(32);
    expect(small.racks.length).toBeGreaterThan(0);
    expect(small.racks.length).toBeGreaterThanOrEqual(12);
    expect(small.racks.length).toBeLessThanOrEqual(30);
    expect(small.stations.length).toBeGreaterThanOrEqual(2);
    expect(small.metadata.defaultLayoutSource).toBe("user_custom_layout_g3oeuj_0w3t");
    expect(small.chargingSpots.length).toBe(2);
    expect(small.parkingSpots.length).toBeGreaterThanOrEqual(4);
    expect(small.cells.filter((cell) => cell.allowRotation).length).toBeGreaterThanOrEqual(2);
    expect(inventoryFromLayout(small).some((bin) => bin.sku && bin.quantity > 0)).toBe(true);
    expect(validateSimulationStart(small)).toHaveLength(0);
    expect(large.grid.rows * large.grid.columns).toBeGreaterThan(small.grid.rows * small.grid.columns);
  });

  it("empty layouts warn about missing inventory but can be auto-populated through the layout store", () => {
    const empty = createEmptyLayout({ rows: 8, columns: 8 });
    expect(validateSimulationStart(empty).some((message) => message.includes("SKU"))).toBe(true);

    useLayoutStore.getState().newLayout({ rows: 8, columns: 8 });
    useLayoutStore.getState().addRack({ row: 2, col: 2 });
    useLayoutStore.getState().populateSampleInventory();
    const populated = useLayoutStore.getState().history.present;
    expect(inventoryFromLayout(populated).filter((bin) => bin.sku && bin.quantity > 0).length).toBeGreaterThan(0);
  });

  it("fit-to-screen uses actual canvas and grid dimensions", () => {
    const small = fitLayoutToCanvas({ canvasWidth: 800, canvasHeight: 500, gridColumns: 30, gridRows: 22, cellSizePx: 22 });
    const large = fitLayoutToCanvas({ canvasWidth: 800, canvasHeight: 500, gridColumns: 60, gridRows: 40, cellSizePx: 22 });
    expect(small.zoom).toBeGreaterThan(large.zoom);
    expect(small.position.x).toBeGreaterThanOrEqual(0);
    expect(small.position.y).toBeGreaterThanOrEqual(0);
  });

  it("pointer-centered zoom keeps the same layout point under the cursor", () => {
    const pointer = { x: 250, y: 150 };
    const stagePosition = { x: 50, y: 30 };
    const before = {
      x: (pointer.x - stagePosition.x) / 1,
      y: (pointer.y - stagePosition.y) / 1
    };
    const nextPosition = zoomAroundPointer({ pointer, stagePosition, oldZoom: 1, newZoom: 2 });
    const after = {
      x: (pointer.x - nextPosition.x) / 2,
      y: (pointer.y - nextPosition.y) / 2
    };
    expect(after).toEqual(before);
  });

  it("runtime collision guard blocks same-cell overlaps and logs a prevention", () => {
    const layout = generateSmallDemoLayout();
    const previous = initializeSimulation(layout, { ...defaultSimulationConfig, robotCount: 2 });
    const proposed = structuredClone(previous);
    proposed.simTimeSec = 1;
    proposed.robots[0] = { ...proposed.robots[0], state: "MOVING_EMPTY", currentCell: { row: 2, col: 2 }, pose: { x: 2.5, y: 2.5, yawDeg: 90 } };
    proposed.robots[1] = { ...proposed.robots[1], state: "MOVING_EMPTY", currentCell: { row: 2, col: 2 }, pose: { x: 2.5, y: 2.5, yawDeg: 270 } };
    const guarded = applyCollisionGuard(layout, previous, proposed, defaultSimulationConfig);
    expect(guarded.trafficDiagnostics.runtimeCollisionPreventionCount).toBeGreaterThan(0);
    expect(guarded.eventLog.some((event) => event.message.includes("Collision prevented"))).toBe(true);
    expect(detectRuntimeCollisions(layout, undefined, guarded).filter((issue) => issue.type === "robot_robot")).toHaveLength(0);
  });

  it("runtime collision detection uses visual pose cells, not only completed currentCell values", () => {
    const layout = generateSmallDemoLayout();
    const state = initializeSimulation(layout, { ...defaultSimulationConfig, robotCount: 2 });
    const proposed = {
      ...state,
      robots: state.robots.map((robot, index) =>
        index === 0
          ? { ...robot, robotId: "robot_001", currentCell: { row: 20, col: 26 }, pose: { x: 26.5, y: 21.3, yawDeg: 180 }, state: "MOVING_LOADED" as const }
          : { ...robot, robotId: "robot_002", currentCell: { row: 21, col: 26 }, pose: { x: 26.5, y: 21.5, yawDeg: 0 }, state: "SERVICING_AT_STATION" as const }
      )
    };

    expect(detectRuntimeCollisions(layout, undefined, proposed).some((issue) => issue.type === "robot_robot")).toBe(true);
  });

  it("runtime collision guard blocks loaded 2x2 rack footprint overlap with blocked cells", () => {
    const layout = generateSmallDemoLayout();
    layout.racks[0] = { ...layout.racks[0], footprintWidthM: 2.4, footprintDepthM: 2.4 };
    layout.cells.push({ row: 5, col: 6, cellType: "BLOCKED", allowedDirections: [] });
    const previous = initializeSimulation(layout, { ...defaultSimulationConfig, robotCount: 1 });
    const proposed = structuredClone(previous);
    proposed.simTimeSec = 1;
    proposed.robots[0] = {
      ...proposed.robots[0],
      state: "MOVING_LOADED",
      carryingRackId: layout.racks[0].id,
      currentCell: { row: 5, col: 5 },
      pose: { x: 5.5, y: 5.5, yawDeg: 90 }
    };
    proposed.rackStates[layout.racks[0].id] = { ...proposed.rackStates[layout.racks[0].id], operationalStatus: "BEING_CARRIED", carriedByRobotId: proposed.robots[0].robotId };
    const guarded = applyCollisionGuard(layout, previous, proposed, defaultSimulationConfig);
    expect(guarded.robots[0].currentCell).toEqual(previous.robots[0].currentCell);
    expect(guarded.trafficDiagnostics.runtimeCollisionPreventionCount).toBe(1);
  });

  it("deterministic collision scenarios prevent intersection and edge-swap overlap", () => {
    const sameIntersection = runCollisionScenario("two_robots_same_intersection");
    expect(sameIntersection.collisionPreventionCount).toBeGreaterThan(0);
    expect(sameIntersection.runtimeCollisionCount).toBe(0);

    const edgeSwap = runCollisionScenario("edge_swap_single_lane");
    expect(edgeSwap.collisionPreventionCount).toBeGreaterThan(0);
    expect(edgeSwap.eventMessages.some((message) => message.includes("Collision prevented"))).toBe(true);
  });

  it("does not report a deadlock from same-tick dispatch reservation conflicts", () => {
    const layout = generateSmallDemoLayout();
    const config = { ...defaultSimulationConfig, robotCount: 4, taskCount: 6 };
    let state = initializeSimulation(layout, config);
    const work = generateOperationalSimulationWork(layout, state, config);
    state = {
      ...state,
      orders: work.orders,
      failedOrders: work.failedOrders,
      tasks: work.tasks,
      operationalTasks: work.operationalTasks,
      inventory: work.inventory,
      rackStates: work.rackStates,
      storageLocationStates: work.storageLocationStates,
      eventLog: work.eventLog
    };

    state = stepSimulation(layout, state, config, 0.2);

    expect(state.trafficDiagnostics.deadlockCount).toBe(0);
    expect(state.trafficDiagnostics.failedDueToTrafficCount).toBe(0);
    expect(state.eventLog.some((event) => event.entityType === "deadlock" || event.message.includes("Deadlock detected"))).toBe(false);
    expect(state.tasks.filter((task) => task.status === "FAILED")).toHaveLength(0);
  });

  it("does not route active robots through occupied parking pockets", () => {
    const layout = generateSmallDemoLayout();
    const path = findPathToNearestRackApproach(layout, layout.parkingSpots[0].cell, layout.racks[0]);
    const otherParkingCells = new Set(layout.parkingSpots.slice(1).map((parking) => cellKey(parking.cell)));
    expect(path.some((cell) => otherParkingCells.has(cellKey(cell)))).toBe(false);
  });

  it("does not spam collision-prevented events against idle spawned robots", () => {
    const layout = generateSmallDemoLayout();
    const config = { ...defaultSimulationConfig, robotCount: 4, taskCount: 6 };
    let state = initializeSimulation(layout, config);
    const work = generateOperationalSimulationWork(layout, state, config);
    state = {
      ...state,
      orders: work.orders,
      failedOrders: work.failedOrders,
      tasks: work.tasks,
      operationalTasks: work.operationalTasks,
      inventory: work.inventory,
      rackStates: work.rackStates,
      storageLocationStates: work.storageLocationStates,
      eventLog: work.eventLog
    };

    for (let tick = 0; tick < 4; tick += 1) {
      state = stepSimulation(layout, state, config, 0.2);
    }

    const occupied = state.robots.map((robot) => cellKey(robot.currentCell));
    expect(new Set(occupied).size).toBe(occupied.length);
    expect(state.failedTasks.length).toBe(0);
  }, 30000);
});

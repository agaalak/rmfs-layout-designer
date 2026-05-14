import { describe, expect, it } from "vitest";
import { defaultGenerationParams, generateProceduralLayout } from "../src/generators/proceduralGenerator";
import { exportInventoryCsv, exportOrdersCsv, exportSimulationEventLogCsv } from "../src/importExport/exportSimulation";
import { defaultSimulationConfig, type SimulationConfig } from "../src/models/simulation";
import { pickInventory, replenishInventory } from "../src/simulation/inventory";
import { generateSampleOrders } from "../src/simulation/orderGeneration";
import { selectRackForOrderLine } from "../src/simulation/controllers/rackSelectionController";
import { selectStorageDestination } from "../src/simulation/controllers/rackStorageController";
import { generateOperationalSimulationWork, initializeSimulation, stepSimulation } from "../src/simulation/simulationEngine";
import { ensureStorageLocations } from "../src/utils/storageLocations";
import { validateLayout } from "../src/validation/validateLayout";

function operationsLayout() {
  return generateProceduralLayout({
    ...defaultGenerationParams,
    rows: 18,
    columns: 28,
    stationCount: 4,
    chargerCount: 3,
    parkingSpotCount: 4,
    rackFillRatio: 0.35
  });
}

const fastConfig: SimulationConfig = {
  ...defaultSimulationConfig,
  robotCount: 3,
  taskCount: 1,
  unloadedSpeedMps: 100,
  loadedSpeedMps: 100,
  liftTimeSec: 0.1,
  dropTimeSec: 0.1,
  stationServiceTimeSec: 0.2,
  reservationTimeStepSec: 1
};

describe("RMFS operational simulation model", () => {
  it("migrates old layouts into first-class storage locations", () => {
    const layout = operationsLayout();
    const oldLayout = { ...layout, storageLocations: [] };
    const migrated = ensureStorageLocations(oldLayout);
    expect(migrated.storageLocations.length).toBeGreaterThan(0);
    expect(migrated.racks[0].homeStorageLocationId).toBeTruthy();
    expect(migrated.racks[0].currentStorageLocationId).toBeTruthy();
  });

  it("validates duplicate storage occupancy", () => {
    const layout = ensureStorageLocations(operationsLayout());
    layout.racks[1].currentStorageLocationId = layout.racks[0].currentStorageLocationId;
    const result = validateLayout(layout);
    expect(result.issues.some((issue) => issue.id.startsWith("storage_duplicate_occupancy"))).toBe(true);
  });

  it("generates order lines from available inventory", () => {
    const state = initializeSimulation(operationsLayout(), fastConfig);
    const orders = generateSampleOrders(state.inventory, 3, 0);
    expect(orders).toHaveLength(3);
    expect(orders[0].orderLines[0].sku).toContain("SKU-");
  });

  it("selects a rack with requested SKU and fails when unavailable", () => {
    const layout = operationsLayout();
    const state = initializeSimulation(layout, fastConfig);
    const sku = state.inventory.find((bin) => bin.sku && bin.quantity > 0)!.sku!;
    const selected = selectRackForOrderLine(layout, state.inventory, state.rackStates, {
      lineId: "line_1",
      sku,
      quantity: 1,
      fulfilledQuantity: 0,
      status: "PENDING"
    }, "nearest_rack_with_sku");
    expect(selected.rack).toBeTruthy();
    const missing = selectRackForOrderLine(layout, state.inventory, state.rackStates, {
      lineId: "line_missing",
      sku: "SKU-NOT-AVAILABLE",
      quantity: 1,
      fulfilledQuantity: 0,
      status: "PENDING"
    }, "nearest_rack_with_sku");
    expect(missing.reason).toContain("No available rack inventory");
  });

  it("updates inventory for pick and replenishment service", () => {
    const state = initializeSimulation(operationsLayout(), fastConfig);
    const bin = state.inventory.find((item) => item.sku && item.quantity > 5)!;
    const afterPick = pickInventory(state.inventory, bin.binId, 2, 10);
    expect(afterPick.find((item) => item.binId === bin.binId)?.quantity).toBe(bin.quantity - 2);
    const afterReplenish = replenishInventory(afterPick, bin.rackId, bin.sku!, 3, 12);
    expect(afterReplenish.find((item) => item.binId === bin.binId)?.quantity).toBe(bin.quantity + 1);
  });

  it("does not select a rack that is already reserved", () => {
    const layout = operationsLayout();
    const state = initializeSimulation(layout, fastConfig);
    const bin = state.inventory.find((item) => item.sku && item.quantity > 0)!;
    state.rackStates[bin.rackId] = { ...state.rackStates[bin.rackId], operationalStatus: "RESERVED" };
    const selected = selectRackForOrderLine(layout, state.inventory.filter((item) => item.rackId === bin.rackId), state.rackStates, {
      lineId: "line_1",
      sku: bin.sku!,
      quantity: 1,
      fulfilledQuantity: 0,
      status: "PENDING"
    }, "nearest_rack_with_sku");
    expect(selected.rack).toBeUndefined();
  });

  it("creates operational tasks with controller decision events", () => {
    const layout = operationsLayout();
    const state = initializeSimulation(layout, fastConfig);
    const work = generateOperationalSimulationWork(layout, state, fastConfig);
    expect(work.orders[0].status).toBe("ASSIGNED");
    expect(work.tasks[0].orderId).toBe(work.orders[0].orderId);
    expect(work.operationalTasks[0].taskKind).toBe("PICK_ORDER");
    expect(work.eventLog.some((event) => event.entityType === "controller")).toBe(true);
  });

  it("completes an order only after rack service and return", () => {
    const layout = operationsLayout();
    let state = initializeSimulation(layout, fastConfig);
    const work = generateOperationalSimulationWork(layout, state, fastConfig);
    state = {
      ...state,
      orders: work.orders,
      tasks: work.tasks,
      operationalTasks: work.operationalTasks,
      inventory: work.inventory,
      rackStates: work.rackStates,
      storageLocationStates: work.storageLocationStates,
      eventLog: work.eventLog
    };
    const selectedBin = work.tasks[0].selectedBins![0];
    const startQuantity = state.inventory.find((bin) => bin.binId === selectedBin.binId)!.quantity;
    let sawCarried = false;
    let sawAtStation = false;
    for (let index = 0; index < 40 && state.completedTasks.length === 0; index += 1) {
      state = stepSimulation(layout, state, fastConfig, 1);
      sawCarried ||= Object.values(state.rackStates).some((rack) => rack.operationalStatus === "BEING_CARRIED" || rack.operationalStatus === "RETURNING");
      sawAtStation ||= Object.values(state.rackStates).some((rack) => rack.operationalStatus === "AT_STATION");
    }
    expect(state.completedOrders[0]?.status).toBe("COMPLETED");
    expect(state.inventory.find((bin) => bin.binId === selectedBin.binId)!.quantity).toBeLessThan(startQuantity);
    expect(state.rackStates[work.tasks[0].rackId].operationalStatus).toBe("STORED");
    expect(sawCarried).toBe(true);
    expect(sawAtStation).toBe(true);
  });

  it("selects storage destinations by strategy", () => {
    const layout = operationsLayout();
    const state = initializeSimulation(layout, fastConfig);
    const rack = layout.racks[0];
    const home = selectStorageDestination(layout, rack, state.storageLocationStates, "return_home");
    const nearest = selectStorageDestination(layout, rack, state.storageLocationStates, "nearest_available_storage", layout.stations[0].cell);
    expect(home?.storageLocationId).toBe(rack.homeStorageLocationId);
    expect(nearest?.storageLocationId).toBeTruthy();
  });

  it("exports orders, inventory, and structured event log CSV", () => {
    const state = initializeSimulation(operationsLayout(), fastConfig);
    const orders = generateSampleOrders(state.inventory, 1, 0);
    expect(exportOrdersCsv(orders)).toContain("orderId");
    expect(exportInventoryCsv(state.inventory)).toContain("reservedQuantity");
    expect(exportSimulationEventLogCsv(state.eventLog)).toContain("entityType");
  });
});


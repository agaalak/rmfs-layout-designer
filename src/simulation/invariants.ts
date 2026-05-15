import type { WarehouseLayout } from "../models/layout";
import type { SimulationState } from "../models/simulation";
import { cellKey, inBounds } from "../utils/gridMath";
import { stationQueueCells } from "../utils/queueLanes";
import { envelopesOverlap } from "./collisionEnvelope";
import { getAllRobotRuntimeEnvelopes } from "./collisionRuntime";

export interface SimulationInvariantIssue {
  invariantId: string;
  severity: "warning" | "error";
  message: string;
  entityIds?: string[];
}

function pushIssue(issues: SimulationInvariantIssue[], invariantId: string, message: string, entityIds?: string[], severity: "warning" | "error" = "error") {
  issues.push({ invariantId, severity, message, entityIds });
}

export function checkSimulationInvariants(layout: WarehouseLayout, state: SimulationState): SimulationInvariantIssue[] {
  const issues: SimulationInvariantIssue[] = [];
  const rackIds = new Set(layout.racks.map((rack) => rack.id));
  const robotIds = new Set(state.robots.map((robot) => robot.robotId));
  const taskIds = new Set(state.tasks.map((task) => task.taskId));
  const stationIds = new Set(layout.stations.map((station) => station.id));
  const storageIds = new Set((layout.storageLocations ?? []).map((location) => location.storageLocationId));

  const envelopes = getAllRobotRuntimeEnvelopes(layout, state);
  for (let i = 0; i < envelopes.length; i += 1) {
    for (let j = i + 1; j < envelopes.length; j += 1) {
      if (envelopesOverlap(envelopes[i], envelopes[j])) {
        pushIssue(issues, "robot.envelope_overlap", `${envelopes[i].robotId} and ${envelopes[j].robotId} have overlapping runtime envelopes.`, [envelopes[i].robotId, envelopes[j].robotId]);
      }
    }
  }

  const carriedRackCounts = new Map<string, string[]>();
  for (const robot of state.robots) {
    if (Number.isNaN(robot.pose.x) || Number.isNaN(robot.pose.y)) pushIssue(issues, "robot.pose_nan", `${robot.robotId} has an invalid NaN pose.`, [robot.robotId]);
    if (!inBounds(robot.currentCell, layout.grid)) pushIssue(issues, "robot.out_of_bounds", `${robot.robotId} is outside the layout grid.`, [robot.robotId]);
    if (robot.assignedTaskId && !taskIds.has(robot.assignedTaskId)) pushIssue(issues, "robot.invalid_task", `${robot.robotId} references missing task ${robot.assignedTaskId}.`, [robot.robotId, robot.assignedTaskId]);
    if (robot.carryingRackId) {
      if (!rackIds.has(robot.carryingRackId)) pushIssue(issues, "robot.invalid_rack", `${robot.robotId} carries missing rack ${robot.carryingRackId}.`, [robot.robotId, robot.carryingRackId]);
      carriedRackCounts.set(robot.carryingRackId, [...(carriedRackCounts.get(robot.carryingRackId) ?? []), robot.robotId]);
    }
    for (const routeCell of robot.currentPath) {
      if (!inBounds(routeCell, layout.grid)) pushIssue(issues, "robot.invalid_route_cell", `${robot.robotId} has an out-of-bounds route cell ${routeCell.row},${routeCell.col}.`, [robot.robotId]);
    }
  }

  for (const [rackId, carrierIds] of carriedRackCounts) {
    if (carrierIds.length > 1) pushIssue(issues, "rack.multiple_carriers", `Rack ${rackId} is carried by multiple robots.`, [rackId, ...carrierIds]);
  }

  for (const [rackId, rackState] of Object.entries(state.rackStates)) {
    if (!rackIds.has(rackId)) pushIssue(issues, "rack_state.missing_rack", `Rack state references missing rack ${rackId}.`, [rackId]);
    if (rackState.operationalStatus === "BEING_CARRIED" && !rackState.carriedByRobotId) pushIssue(issues, "rack_state.missing_carrier", `Rack ${rackId} is BEING_CARRIED without a carrying robot.`, [rackId]);
    if (rackState.carriedByRobotId && !robotIds.has(rackState.carriedByRobotId)) pushIssue(issues, "rack_state.invalid_carrier", `Rack ${rackId} references missing carrier ${rackState.carriedByRobotId}.`, [rackId, rackState.carriedByRobotId]);
    if (rackState.operationalStatus === "STORED" && !rackState.currentStorageLocationId) pushIssue(issues, "rack_state.missing_storage", `Stored rack ${rackId} has no current storage location.`, [rackId]);
    if (rackState.currentStorageLocationId && !storageIds.has(rackState.currentStorageLocationId)) pushIssue(issues, "rack_state.invalid_storage", `Rack ${rackId} references missing storage location ${rackState.currentStorageLocationId}.`, [rackId]);
  }

  const storageOccupancy = new Map<string, string[]>();
  for (const [storageLocationId, storageState] of Object.entries(state.storageLocationStates)) {
    if (!storageIds.has(storageLocationId)) pushIssue(issues, "storage_state.missing_location", `Storage state references missing location ${storageLocationId}.`, [storageLocationId]);
    if (storageState.currentlyStoredRackId) {
      if (!rackIds.has(storageState.currentlyStoredRackId)) pushIssue(issues, "storage_state.invalid_rack", `Storage ${storageLocationId} references missing rack ${storageState.currentlyStoredRackId}.`, [storageLocationId]);
      storageOccupancy.set(storageLocationId, [...(storageOccupancy.get(storageLocationId) ?? []), storageState.currentlyStoredRackId]);
    }
  }
  for (const [storageLocationId, rackList] of storageOccupancy) {
    if (new Set(rackList).size !== rackList.length) pushIssue(issues, "storage.duplicate_occupancy", `Storage ${storageLocationId} has duplicate rack occupancy.`, [storageLocationId, ...rackList]);
  }

  for (const inventory of state.inventory) {
    if ((inventory.reservedQuantity ?? 0) > inventory.quantity) pushIssue(issues, "inventory.over_reserved", `Bin ${inventory.binId} has reserved quantity greater than available quantity.`, [inventory.binId]);
    if (inventory.quantity < 0) pushIssue(issues, "inventory.negative_quantity", `Bin ${inventory.binId} has negative quantity.`, [inventory.binId]);
  }

  for (const order of [...state.orders, ...state.completedOrders, ...state.failedOrders]) {
    for (const line of order.orderLines) {
      if (line.fulfilledQuantity > line.quantity) pushIssue(issues, "order_line.over_fulfilled", `Order line ${line.lineId} is over-fulfilled.`, [order.orderId, line.lineId]);
    }
  }

  const activeRackTaskCounts = new Map<string, string[]>();
  for (const task of state.tasks) {
    if (task.robotId && !robotIds.has(task.robotId)) pushIssue(issues, "task.invalid_robot", `Task ${task.taskId} references missing robot ${task.robotId}.`, [task.taskId, task.robotId]);
    if (!rackIds.has(task.rackId)) pushIssue(issues, "task.invalid_rack", `Task ${task.taskId} references missing rack ${task.rackId}.`, [task.taskId, task.rackId]);
    if (task.stationId && !stationIds.has(task.stationId)) pushIssue(issues, "task.invalid_station", `Task ${task.taskId} references missing station ${task.stationId}.`, [task.taskId, task.stationId]);
    if (task.destinationStorageLocationId && !storageIds.has(task.destinationStorageLocationId)) pushIssue(issues, "task.invalid_storage", `Task ${task.taskId} references missing destination storage ${task.destinationStorageLocationId}.`, [task.taskId]);
    if (["ASSIGNED", "IN_PROGRESS"].includes(task.status)) {
      activeRackTaskCounts.set(task.rackId, [...(activeRackTaskCounts.get(task.rackId) ?? []), task.taskId]);
    }
  }
  for (const [rackId, tasks] of activeRackTaskCounts) {
    if (tasks.length > 1) pushIssue(issues, "task.duplicate_active_rack", `Rack ${rackId} is assigned to multiple active tasks.`, [rackId, ...tasks]);
  }

  for (const queue of state.stationQueues) {
    const station = layout.stations.find((item) => item.id === queue.stationId);
    if (!station) {
      pushIssue(issues, "station_queue.invalid_station", `Queue references missing station ${queue.stationId}.`, [queue.stationId]);
      continue;
    }
    const capacity = Math.max(1, stationQueueCells(layout, station).length);
    if (queue.waitingRobotIds.length > capacity) pushIssue(issues, "station_queue.overflow", `Station ${station.stationId} queue exceeds linked queue lane capacity.`, [station.id]);
    for (const robotId of queue.waitingRobotIds) {
      if (!robotIds.has(robotId)) pushIssue(issues, "station_queue.invalid_robot", `Station ${station.stationId} queue references missing robot ${robotId}.`, [station.id, robotId]);
    }
  }

  for (const bucket of [state.reservationTable.reservedVertices, state.reservationTable.reservedEdges, state.reservationTable.reservedResources ?? {}]) {
    for (const records of Object.values(bucket)) {
      for (const record of records) {
        for (const cell of record.cells ?? (record.cell ? [record.cell] : [])) {
          const reservationId = record.reservationId ?? "reservation";
          if (!inBounds(cell, layout.grid)) pushIssue(issues, "reservation.out_of_bounds", `Reservation ${reservationId} uses invalid cell ${cellKey(cell)}.`, [reservationId]);
        }
      }
    }
  }

  return issues;
}

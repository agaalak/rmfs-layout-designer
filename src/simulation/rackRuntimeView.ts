import type { GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { Rack } from "../models/rack";
import type { SimulationState } from "../models/simulation";

export interface RackRuntimeRenderState {
  rackId: string;
  hidden: boolean;
  cell: GridCell;
  orientationDeg: Rack["currentOrientationDeg"];
  currentStorageLocationId?: string;
  reason?: string;
}

export function getRackRuntimeRenderState(layout: WarehouseLayout, state: SimulationState, rack: Rack): RackRuntimeRenderState {
  const rackState = state.rackStates[rack.id];
  const carryingRobot = state.robots.find((robot) => robot.carryingRackId === rack.id || robot.robotId === rackState?.carriedByRobotId);
  if (carryingRobot || ["BEING_CARRIED", "AT_STATION", "RETURNING"].includes(rackState?.operationalStatus ?? "")) {
    return {
      rackId: rack.id,
      hidden: true,
      cell: carryingRobot?.currentCell ?? rackState?.currentCell ?? rack.homeCell,
      orientationDeg: rackState?.currentOrientationDeg ?? rack.currentOrientationDeg,
      currentStorageLocationId: rackState?.currentStorageLocationId,
      reason: "carried_by_robot"
    };
  }

  const storageId = rackState?.currentStorageLocationId ?? rack.currentStorageLocationId ?? rack.homeStorageLocationId;
  const storage = layout.storageLocations.find((location) => location.storageLocationId === storageId);
  return {
    rackId: rack.id,
    hidden: false,
    cell: rackState?.currentCell ?? storage?.podServiceCell ?? rack.homeCell,
    orientationDeg: rackState?.currentOrientationDeg ?? rack.currentOrientationDeg,
    currentStorageLocationId: storageId
  };
}


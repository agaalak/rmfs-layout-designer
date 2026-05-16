import type { WarehouseLayout } from "../../models/layout";
import type { Rack } from "../../models/rack";
import type { Robot } from "../../models/robot";
import type { SimulationTask } from "../../models/task";
import { cellKey } from "../../utils/gridMath";
import { storageLocationForRackTask } from "../pathPlanner";

export function rackPickupServiceCell(layout: WarehouseLayout, rack: Rack, task: Pick<SimulationTask, "sourceStorageLocationId">) {
  return storageLocationForRackTask(layout, rack, task.sourceStorageLocationId)?.podServiceCell ?? rack.homeCell;
}

export function rackDropServiceCell(layout: WarehouseLayout, rack: Rack, task: Pick<SimulationTask, "destinationStorageLocationId">) {
  return storageLocationForRackTask(layout, rack, task.destinationStorageLocationId)?.podServiceCell ?? rack.homeCell;
}

export function canLiftRackAtCurrentCell(layout: WarehouseLayout, robot: Robot, rack: Rack, task: Pick<SimulationTask, "sourceStorageLocationId">) {
  const serviceCell = rackPickupServiceCell(layout, rack, task);
  return {
    allowed: cellKey(robot.currentCell) === cellKey(serviceCell),
    serviceCell
  };
}

export function canDropRackAtCurrentCell(layout: WarehouseLayout, robot: Robot, rack: Rack, task: Pick<SimulationTask, "destinationStorageLocationId">) {
  const serviceCell = rackDropServiceCell(layout, rack, task);
  return {
    allowed: cellKey(robot.currentCell) === cellKey(serviceCell),
    serviceCell
  };
}

import type { WarehouseLayout } from "../../models/layout";
import type { Robot } from "../../models/robot";
import type { SimulationState } from "../../models/simulation";
import { cellKey } from "../../utils/gridMath";

export function robotIsAtStationServiceCell(layout: WarehouseLayout, robot: Robot, stationId: string) {
  const station = layout.stations.find((item) => item.id === stationId);
  return Boolean(station && cellKey(robot.currentCell) === cellKey(station.cell));
}

export function stationServiceReadyRobots(layout: WarehouseLayout, state: SimulationState, stationId: string) {
  return state.robots.filter((robot) => {
    if (robot.state !== "QUEUING_AT_STATION") return false;
    if (!robotIsAtStationServiceCell(layout, robot, stationId)) return false;
    const task = robot.assignedTaskId ? state.tasks.find((item) => item.taskId === robot.assignedTaskId) : undefined;
    return task?.stationId === stationId;
  });
}

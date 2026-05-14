import type { GridCell } from "../../models/grid";
import type { Robot } from "../../models/robot";
import type { RobotAssignmentStrategy } from "../../models/simulation";
import { manhattanMeters } from "../../utils/gridMath";
import type { WarehouseLayout } from "../../models/layout";

export function selectRobotForCell(
  layout: WarehouseLayout,
  robots: Robot[],
  targetCell: GridCell,
  strategy: RobotAssignmentStrategy
): Robot | undefined {
  const available = robots.filter((robot) => ["IDLE", "PARKING", "CHARGING"].includes(robot.state) && !robot.assignedTaskId);
  if (strategy === "first_available_robot") return available[0];
  return [...available].sort((a, b) => manhattanMeters(a.currentCell, targetCell, layout.grid) - manhattanMeters(b.currentCell, targetCell, layout.grid))[0];
}


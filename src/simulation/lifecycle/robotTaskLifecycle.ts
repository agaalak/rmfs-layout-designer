import type { Robot } from "../../models/robot";

export function movementComplete(robot: Robot) {
  return robot.currentPath.length <= 1 || robot.routeIndex >= robot.currentPath.length - 1;
}

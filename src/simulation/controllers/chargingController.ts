import type { WarehouseLayout } from "../../models/layout";
import type { Robot } from "../../models/robot";
import type { ChargingStrategy } from "../../models/simulation";
import { manhattanMeters } from "../../utils/gridMath";

export function selectRobotForCharging(layout: WarehouseLayout, robots: Robot[], strategy: ChargingStrategy): { robot?: Robot; chargerCell?: { row: number; col: number } } {
  if (strategy === "none") return {};
  const robot = [...robots].filter((item) => ["IDLE", "PARKING"].includes(item.state) && item.batteryPercent < 25).sort((a, b) => a.batteryPercent - b.batteryPercent)[0];
  if (!robot) return {};
  const chargerCell = layout.chargingSpots
    .flatMap((charger) => charger.cells)
    .sort((a, b) => manhattanMeters(robot.currentCell, a, layout.grid) - manhattanMeters(robot.currentCell, b, layout.grid))[0];
  return { robot, chargerCell };
}


import { Group, Rect, Text } from "react-konva";
import type { WarehouseLayout } from "../../models/layout";
import type { SimulationState } from "../../models/simulation";

export function SimulationOverlayLayer({ layout, simulation, cellSize }: { layout: WarehouseLayout; simulation: SimulationState; cellSize: number }) {
  return (
    <Group listening={false}>
      {layout.stations.map((station) => {
        const queue = simulation.stationQueues.find((item) => item.stationId === station.id);
        if (!queue || (!queue.activeRobotId && queue.waitingRobotIds.length === 0)) return null;
        return (
          <Rect
            key={station.id}
            x={station.cell.col * cellSize}
            y={station.cell.row * cellSize}
            width={cellSize}
            height={cellSize}
            stroke="#f97316"
            strokeWidth={3}
            dash={[3, 2]}
          />
        );
      })}
      <Text
        x={8}
        y={8}
        text={`Sim ${simulation.simTimeSec.toFixed(1)}s | ${simulation.isRunning ? "running" : "paused"} | tasks ${simulation.metrics.activeTaskCount}`}
        fontSize={12}
        fill="#0f172a"
        padding={6}
        fillAfterStrokeEnabled
      />
    </Group>
  );
}

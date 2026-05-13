import { Group, Rect } from "react-konva";
import type { SimulationState } from "../../models/simulation";
import { reservationCellsForDisplay } from "../../simulation/simulationEngine";
import { cellKey } from "../../utils/gridMath";

export function ReservationLayer({ simulation, cellSize, visible }: { simulation: SimulationState; cellSize: number; visible: boolean }) {
  if (!visible) return null;
  const cells = [...new Map(reservationCellsForDisplay(simulation).map((cell) => [cellKey(cell), cell])).values()];
  return (
    <Group listening={false}>
      {cells.map((cell) => (
        <Rect
          key={cellKey(cell)}
          x={cell.col * cellSize}
          y={cell.row * cellSize}
          width={cellSize}
          height={cellSize}
          fill="#0f766e"
          opacity={0.16}
          stroke="#0f766e"
          strokeWidth={1}
        />
      ))}
    </Group>
  );
}

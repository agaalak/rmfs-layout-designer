import { Group, Line } from "react-konva";
import type { SimulationState } from "../../models/simulation";

export function PathLayer({ simulation, cellSize, visible }: { simulation: SimulationState; cellSize: number; visible: boolean }) {
  if (!visible) return null;
  return (
    <Group listening={false}>
      {simulation.robots.map((robot) => {
        if (robot.currentPath.length < 2) return null;
        const points = robot.currentPath.flatMap((cell) => [cell.col * cellSize + cellSize / 2, cell.row * cellSize + cellSize / 2]);
        return <Line key={robot.robotId} points={points} stroke={robot.color} strokeWidth={2} opacity={0.45} dash={[6, 4]} />;
      })}
    </Group>
  );
}

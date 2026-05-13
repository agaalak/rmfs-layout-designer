import { Group, Line } from "react-konva";
import type { GridConfig } from "../../models/grid";

interface GridLayerProps {
  grid: GridConfig;
  cellSize: number;
  visible: boolean;
}

export function GridLayer({ grid, cellSize, visible }: GridLayerProps) {
  if (!visible) return null;
  const width = grid.columns * cellSize;
  const height = grid.rows * cellSize;
  const lines = [];
  for (let col = 0; col <= grid.columns; col += 1) {
    lines.push(
      <Line key={`v-${col}`} points={[col * cellSize, 0, col * cellSize, height]} stroke="#e5e7eb" strokeWidth={1} />
    );
  }
  for (let row = 0; row <= grid.rows; row += 1) {
    lines.push(
      <Line key={`h-${row}`} points={[0, row * cellSize, width, row * cellSize]} stroke="#e5e7eb" strokeWidth={1} />
    );
  }
  return <Group listening={false}>{lines}</Group>;
}

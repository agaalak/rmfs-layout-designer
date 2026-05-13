import { Arrow, Group } from "react-konva";
import type { WarehouseLayout } from "../../models/layout";
import { allDirections, traversableCellTypes } from "../../models/grid";

interface DirectionArrowLayerProps {
  layout: WarehouseLayout;
  cellSize: number;
  visible: boolean;
}

const vector = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0]
} as const;

export function DirectionArrowLayer({ layout, cellSize, visible }: DirectionArrowLayerProps) {
  if (!visible) return null;
  return (
    <Group listening={false}>
      {layout.cells
        .filter((cell) => traversableCellTypes.has(cell.cellType) && (cell.allowedDirections ?? allDirections).length < allDirections.length)
        .flatMap((cell) =>
          (cell.allowedDirections ?? allDirections).map((direction) => {
            const [dx, dy] = vector[direction];
            const cx = cell.col * cellSize + cellSize / 2;
            const cy = cell.row * cellSize + cellSize / 2;
            return (
              <Arrow
                key={`${cell.row}:${cell.col}:${direction}`}
                points={[cx - dx * 4, cy - dy * 4, cx + dx * 6, cy + dy * 6]}
                stroke="#475569"
                fill="#475569"
                pointerLength={4}
                pointerWidth={4}
                strokeWidth={1}
                opacity={0.45}
              />
            );
          })
        )}
    </Group>
  );
}

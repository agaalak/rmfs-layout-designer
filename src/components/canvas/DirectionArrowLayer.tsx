import { Arrow, Group } from "react-konva";
import type { WarehouseLayout } from "../../models/layout";
import { allDirections, traversableCellTypes } from "../../models/grid";
import { directionForNeighbor } from "../../utils/directionLinks";

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
  const activeLinks = (layout.directedLinks ?? []).filter((link) => link.enabled);
  if (activeLinks.length > 0) {
    const hasReverse = new Set(activeLinks.map((link) => `${link.toCell.row}:${link.toCell.col}>${link.fromCell.row}:${link.fromCell.col}`));
    const restrictedCells = new Set(
      layout.cells
        .filter((cell) => traversableCellTypes.has(cell.cellType) && (cell.allowedDirections ?? allDirections).length < allDirections.length)
        .map((cell) => `${cell.row}:${cell.col}`)
    );
    const displayLinks = activeLinks.filter((link) => {
      const paired = hasReverse.has(`${link.fromCell.row}:${link.fromCell.col}>${link.toCell.row}:${link.toCell.col}`);
      return !paired || link.traversalMode !== "NORMAL" || restrictedCells.has(`${link.fromCell.row}:${link.fromCell.col}`);
    });
    return (
      <Group listening={false}>
        {displayLinks.map((link) => {
          const direction = directionForNeighbor(link.fromCell, link.toCell);
          if (!direction) return null;
          const [dx, dy] = vector[direction];
          const paired = hasReverse.has(`${link.fromCell.row}:${link.fromCell.col}>${link.toCell.row}:${link.toCell.col}`);
          const offset = paired ? 3 : 0;
          const ox = direction === "north" || direction === "south" ? offset : 0;
          const oy = direction === "east" || direction === "west" ? offset : 0;
          const sx = link.fromCell.col * cellSize + cellSize / 2 + ox;
          const sy = link.fromCell.row * cellSize + cellSize / 2 + oy;
          const tx = link.toCell.col * cellSize + cellSize / 2 + ox;
          const ty = link.toCell.row * cellSize + cellSize / 2 + oy;
          const color = paired ? "#0f766e" : "#2563eb";
          return (
            <Arrow
              key={link.linkId}
              points={[sx + dx * 9, sy + dy * 9, tx - dx * 9, ty - dy * 9]}
              stroke={color}
              fill={color}
              pointerLength={6}
              pointerWidth={6}
              strokeWidth={1.8}
              opacity={paired ? 0.72 : 0.82}
              lineCap="round"
              lineJoin="round"
            />
          );
        })}
      </Group>
    );
  }
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
                stroke="#2563eb"
                fill="#2563eb"
                pointerLength={4}
                pointerWidth={4}
                strokeWidth={1.4}
                opacity={0.58}
                lineCap="round"
                lineJoin="round"
              />
            );
          })
        )}
    </Group>
  );
}

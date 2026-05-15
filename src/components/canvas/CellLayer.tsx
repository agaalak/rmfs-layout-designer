import { Group, Rect } from "react-konva";
import type { LayoutCell } from "../../models/grid";
import { cellKey } from "../../utils/gridMath";

export const cellColors: Record<string, string> = {
  EMPTY: "#ffffff",
  ROAD: "#cbd5e1",
  RACK_STORAGE: "#bfdbfe",
  STATION: "#fb923c",
  QUEUE: "#fde68a",
  CHARGING: "#86efac",
  PARKING: "#c4b5fd",
  BLOCKED: "#111827",
  HUMAN_ZONE: "#f5deb3",
  DOCK: "#a16207"
};

interface CellLayerProps {
  cells: LayoutCell[];
  cellSize: number;
  issueCells: Set<string>;
}

export function CellLayer({ cells, cellSize, issueCells }: CellLayerProps) {
  return (
    <Group>
      {cells.map((cell) => {
        const key = cellKey(cell);
        return (
          <Rect
            key={key}
            x={cell.col * cellSize}
            y={cell.row * cellSize}
            width={cellSize}
            height={cellSize}
            fill={cellColors[cell.cellType] ?? "#fff"}
            opacity={cell.cellType === "ROAD" ? 0.82 : 0.9}
            stroke={issueCells.has(key) ? "#ef4444" : "transparent"}
            strokeWidth={issueCells.has(key) ? 3 : 0}
            dash={issueCells.has(key) ? [4, 2] : undefined}
            listening={false}
          />
        );
      })}
    </Group>
  );
}

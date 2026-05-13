import { Group, Rect } from "react-konva";

interface SelectionLayerProps {
  rect?: { x: number; y: number; width: number; height: number };
}

export function SelectionLayer({ rect }: SelectionLayerProps) {
  if (!rect) return null;
  return (
    <Group listening={false}>
      <Rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        fill="rgba(20, 184, 166, 0.12)"
        stroke="#0f766e"
        strokeWidth={1}
        dash={[4, 4]}
      />
    </Group>
  );
}

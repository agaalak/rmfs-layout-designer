import { Arrow, Group, Rect, Text } from "react-konva";
import type { WarehouseLayout, SelectedObjectRef } from "../../models/layout";
import type { SimulationState } from "../../models/simulation";
import type { ValidationResult } from "../../validation/validateLayout";
import { cellToPoint, orientationToVector } from "../../utils/geometry";
import { rackFootprintCells } from "../../utils/rackFootprint";
import { getRackRuntimeRenderState } from "../../simulation/rackRuntimeView";

function isSelected(selected: SelectedObjectRef[], id: string) {
  return selected.some((item) => item.kind === "rack" && item.id === id);
}

function shortNumericLabel(value: string) {
  const match = value.match(/(\d+)(?!.*\d)/);
  return match ? match[1] : value.replace(/^[^_]+_?/, "").slice(0, 4);
}

export function RuntimeRackLayer({
  layout,
  simulation,
  selected,
  validation,
  cellSize,
  showLabels,
  onSelect
}: {
  layout: WarehouseLayout;
  simulation: SimulationState;
  selected: SelectedObjectRef[];
  validation: ValidationResult;
  cellSize: number;
  showLabels: boolean;
  onSelect: (ref: SelectedObjectRef, additive: boolean) => void;
}) {
  return (
    <Group>
      {layout.racks.map((rack) => {
        const renderState = getRackRuntimeRenderState(layout, simulation, rack);
        if (renderState.hidden) return null;
        const runtimeRack = {
          ...rack,
          homeCell: renderState.cell,
          currentOrientationDeg: renderState.orientationDeg
        };
        const point = cellToPoint(renderState.cell, cellSize);
        const selectedRack = isSelected(selected, rack.id);
        const [dx, dy] = orientationToVector(runtimeRack.currentOrientationDeg);
        const footprint = rackFootprintCells(runtimeRack, layout.grid);
        const width = footprint.columns * cellSize;
        const height = footprint.rows * cellSize;
        const hasIssue = validation.issueByObjectId.has(rack.id);
        return (
          <Group
            key={`runtime_${rack.id}`}
            x={point.x}
            y={point.y}
            onClick={(event) => {
              event.cancelBubble = true;
              onSelect({ kind: "rack", id: rack.id }, event.evt.shiftKey);
            }}
          >
            <Rect
              width={width}
              height={height}
              fill="#1d4ed8"
              stroke={hasIssue ? "#ef4444" : selectedRack ? "#0f766e" : "#082f49"}
              strokeWidth={selectedRack ? 4 : 1.5}
              cornerRadius={2}
              dash={renderState.currentStorageLocationId !== rack.homeStorageLocationId ? [5, 3] : undefined}
            />
            <Rect width={width} height={height / 2} fill="#60a5fa" opacity={0.95} />
            <Arrow
              points={[width / 2 - dx * 3, height / 2 - dy * 3, width / 2 + dx * 9, height / 2 + dy * 9]}
              stroke="#082f49"
              fill="#082f49"
              pointerLength={5}
              pointerWidth={5}
              strokeWidth={2}
            />
            {showLabels ? (
              <Text
                text={shortNumericLabel(rack.rackId)}
                x={1}
                y={1}
                width={width - 2}
                height={height - 2}
                align="center"
                verticalAlign="middle"
                fontSize={8}
                fill="#eff6ff"
                fontStyle="bold"
              />
            ) : null}
          </Group>
        );
      })}
    </Group>
  );
}


import { Arrow, Group, Rect, Text } from "react-konva";
import type { WarehouseLayout, SelectedObjectRef } from "../../models/layout";
import type { ValidationResult } from "../../validation/validateLayout";
import { cellToPoint, orientationToVector } from "../../utils/geometry";
import { rackFootprintCells } from "../../utils/rackFootprint";

interface ObjectLayerProps {
  layout: WarehouseLayout;
  selected: SelectedObjectRef[];
  validation: ValidationResult;
  cellSize: number;
  showLabels: boolean;
  onSelect: (ref: SelectedObjectRef, additive: boolean) => void;
  onMove: (ref: SelectedObjectRef, row: number, col: number) => void;
  hiddenRackIds?: Set<string>;
  draggableObjects?: boolean;
}

function isSelected(selected: SelectedObjectRef[], kind: SelectedObjectRef["kind"], id: string) {
  return selected.some((item) => item.kind === kind && item.id === id);
}

function objectStroke(validation: ValidationResult, selected: boolean, id: string) {
  if (validation.issueByObjectId.has(id)) return "#ef4444";
  if (selected) return "#0f766e";
  return "#0f172a";
}

function shortNumericLabel(value: string) {
  const match = value.match(/(\d+)(?!.*\d)/);
  return match ? match[1] : value.replace(/^[^_]+_?/, "").slice(0, 4);
}

export function ObjectLayer({ layout, selected, validation, cellSize, showLabels, onSelect, onMove, hiddenRackIds = new Set(), draggableObjects = true }: ObjectLayerProps) {
  return (
    <Group>
      {layout.racks.map((rack) => {
        if (hiddenRackIds.has(rack.id)) return null;
        const point = cellToPoint(rack.homeCell, cellSize);
        const selectedRack = isSelected(selected, "rack", rack.id);
        const [dx, dy] = orientationToVector(rack.currentOrientationDeg);
        const footprint = rackFootprintCells(rack, layout.grid);
        const width = footprint.columns * cellSize;
        const height = footprint.rows * cellSize;
        return (
          <Group
            key={rack.id}
            x={point.x}
            y={point.y}
            draggable={draggableObjects}
            onClick={(event) => {
              event.cancelBubble = true;
              onSelect({ kind: "rack", id: rack.id }, event.evt.shiftKey);
            }}
            onDragEnd={(event) => onMove({ kind: "rack", id: rack.id }, Math.round(event.target.y() / cellSize), Math.round(event.target.x() / cellSize))}
          >
            <Rect width={width} height={height} fill="#2563eb" stroke={objectStroke(validation, selectedRack, rack.id)} strokeWidth={selectedRack ? 4 : 1.5} cornerRadius={2} shadowBlur={selectedRack ? 6 : 0} shadowColor="#14b8a6" />
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
            {rack.locked ? <Text text="L" x={width - 7} y={1} fontSize={7} fill="#f8fafc" fontStyle="bold" /> : null}
          </Group>
        );
      })}
      {layout.stations.map((station) => {
        const point = cellToPoint(station.cell, cellSize);
        const selectedStation = isSelected(selected, "station", station.id);
        const [dx, dy] = orientationToVector(station.requiredRackOrientationDeg);
        return (
          <Group
            key={station.id}
            x={point.x}
            y={point.y}
            draggable={draggableObjects}
            onClick={(event) => {
              event.cancelBubble = true;
              onSelect({ kind: "station", id: station.id }, event.evt.shiftKey);
            }}
            onDragEnd={(event) => onMove({ kind: "station", id: station.id }, Math.round(event.target.y() / cellSize), Math.round(event.target.x() / cellSize))}
          >
            <Rect width={cellSize} height={cellSize} fill="#f97316" stroke={objectStroke(validation, selectedStation, station.id)} strokeWidth={selectedStation ? 3 : 1.5} cornerRadius={2} />
            <Arrow
              points={[cellSize / 2, cellSize / 2, cellSize / 2 + dx * 13, cellSize / 2 + dy * 13]}
              stroke="#7c2d12"
              fill="#7c2d12"
              pointerLength={5}
              pointerWidth={5}
              strokeWidth={2}
            />
            {showLabels ? (
              <Text
                text={`${shortNumericLabel(station.stationId)} ${station.stationType.slice(0, 1)}`}
                x={1}
                y={1}
                width={cellSize - 2}
                height={cellSize - 2}
                align="center"
                verticalAlign="middle"
                fontSize={9}
                fill="#7c2d12"
                fontStyle="bold"
              />
            ) : null}
            {station.locked ? <Text text="L" x={cellSize - 7} y={1} fontSize={7} fill="#7c2d12" fontStyle="bold" /> : null}
          </Group>
        );
      })}
      {layout.chargingSpots.map((charger) => {
        const first = charger.cells[0];
        const point = cellToPoint(first, cellSize);
        const selectedCharger = isSelected(selected, "charger", charger.id);
        return (
          <Group
            key={charger.id}
            x={point.x}
            y={point.y}
            draggable={draggableObjects}
            onClick={(event) => {
              event.cancelBubble = true;
              onSelect({ kind: "charger", id: charger.id }, event.evt.shiftKey);
            }}
            onDragEnd={(event) => onMove({ kind: "charger", id: charger.id }, Math.round(event.target.y() / cellSize), Math.round(event.target.x() / cellSize))}
          >
            <Rect width={cellSize * charger.cells.length} height={cellSize} fill="#22c55e" stroke={objectStroke(validation, selectedCharger, charger.id)} strokeWidth={selectedCharger ? 3 : 1.5} cornerRadius={2} />
            {showLabels ? (
              <Text
                text={shortNumericLabel(charger.chargerId)}
                x={1}
                y={1}
                width={cellSize * charger.cells.length - 2}
                height={cellSize - 2}
                align="center"
                verticalAlign="middle"
                fontSize={9}
                fontStyle="bold"
                fill="#052e16"
              />
            ) : null}
            {charger.locked ? <Text text="L" x={cellSize * charger.cells.length - 7} y={1} fontSize={7} fill="#052e16" fontStyle="bold" /> : null}
          </Group>
        );
      })}
      {layout.parkingSpots.map((parking) => {
        const point = cellToPoint(parking.cell, cellSize);
        const selectedParking = isSelected(selected, "parking", parking.id);
        return (
          <Group
            key={parking.id}
            x={point.x}
            y={point.y}
            draggable={draggableObjects}
            onClick={(event) => {
              event.cancelBubble = true;
              onSelect({ kind: "parking", id: parking.id }, event.evt.shiftKey);
            }}
            onDragEnd={(event) => onMove({ kind: "parking", id: parking.id }, Math.round(event.target.y() / cellSize), Math.round(event.target.x() / cellSize))}
          >
            <Rect width={cellSize} height={cellSize} fill="#a78bfa" stroke={objectStroke(validation, selectedParking, parking.id)} strokeWidth={selectedParking ? 3 : 1.5} cornerRadius={2} />
            {showLabels ? (
              <Text
                text={shortNumericLabel(parking.parkingId)}
                x={1}
                y={1}
                width={cellSize - 2}
                height={cellSize - 2}
                align="center"
                verticalAlign="middle"
                fontSize={9}
                fontStyle="bold"
                fill="#312e81"
              />
            ) : null}
            {parking.locked ? <Text text="L" x={cellSize - 7} y={1} fontSize={7} fill="#312e81" fontStyle="bold" /> : null}
          </Group>
        );
      })}
      {layout.cells.filter((cell) => cell.allowRotation).map((cell) => {
        const point = cellToPoint(cell, cellSize);
        return (
          <Group key={`rotation_cell_${cell.row}_${cell.col}`} x={point.x} y={point.y} listening={false}>
            <Text text="⟳" x={0} y={0} width={cellSize} height={cellSize} align="center" verticalAlign="middle" fontSize={Math.max(11, cellSize * 0.55)} fontStyle="bold" fill="#be123c" />
          </Group>
        );
      })}
    </Group>
  );
}

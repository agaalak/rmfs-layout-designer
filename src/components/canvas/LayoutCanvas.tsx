import { useEffect, useRef, useState } from "react";
import { Stage } from "react-konva";
import type Konva from "konva";
import type { CellType, GridCell } from "../../models/grid";
import type { AnalyticsResult } from "../../analytics/types";
import type { ValidationResult } from "../../validation/validateLayout";
import { useCurrentLayout, useLayoutStore } from "../../store/layoutStore";
import { useUiStore } from "../../store/uiStore";
import { pointToCell } from "../../utils/geometry";
import { cellKey, inBounds, rectCells } from "../../utils/gridMath";
import { rackOccupiedCells } from "../../utils/rackFootprint";
import { exportStagePng } from "../../importExport/exportImage";
import { CellLayer } from "./CellLayer";
import { DirectionArrowLayer } from "./DirectionArrowLayer";
import { GridLayer } from "./GridLayer";
import { HeatmapLayer } from "./HeatmapLayer";
import { ObjectLayer } from "./ObjectLayer";
import { SelectionLayer } from "./SelectionLayer";

interface LayoutCanvasProps {
  validation: ValidationResult;
  analytics: AnalyticsResult;
}

const toolToCellType: Partial<Record<string, CellType>> = {
  road: "ROAD",
  "rack-storage": "RACK_STORAGE",
  queue: "QUEUE",
  blocked: "BLOCKED",
  "human-zone": "HUMAN_ZONE",
  dock: "DOCK"
};

export function LayoutCanvas({ validation, analytics }: LayoutCanvasProps) {
  const layout = useCurrentLayout();
  const {
    selected,
    selectedCell,
    drawCell,
    eraseCell,
    addRack,
    addStation,
    addCharger,
    addParking,
    addRotation,
    selectObject,
    selectCell,
    setSelection,
    clearSelection,
    moveObject,
    deleteSelected,
    rotateSelected,
    copySelected,
    pasteClipboard
  } = useLayoutStore();
  const { activeTool, zoom, showGrid, showLabels, showDirectionArrows, showHeatmap, heatmapMode, hoverCell, setHoverCell } = useUiStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const isPaintingRef = useRef(false);
  const lastPaintedCellRef = useRef<string | undefined>(undefined);
  const [containerSize, setContainerSize] = useState({ width: 900, height: 620 });
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [selectionStart, setSelectionStart] = useState<GridCell | undefined>();
  const [selectionEnd, setSelectionEnd] = useState<GridCell | undefined>();
  const cellSize = 22;
  const gridPixelWidth = layout.grid.columns * cellSize * zoom;
  const gridPixelHeight = layout.grid.rows * cellSize * zoom;
  const width = Math.max(320, containerSize.width);
  const height = Math.max(320, containerSize.height);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      if (event.key === "Delete" || event.key === "Backspace") deleteSelected();
      if (event.key.toLowerCase() === "r") rotateSelected();
      if (meta && event.key.toLowerCase() === "c") copySelected();
      if (meta && event.key.toLowerCase() === "v") pasteClipboard();
      if (meta && event.key.toLowerCase() === "z") useLayoutStore.getState().undo();
      if (meta && event.key.toLowerCase() === "y") useLayoutStore.getState().redo();
    };
    const exportPng = () => {
      if (stageRef.current) exportStagePng(stageRef.current);
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("rmfs-export-png", exportPng);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("rmfs-export-png", exportPng);
    };
  }, [copySelected, deleteSelected, pasteClipboard, rotateSelected]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const resize = () =>
      setContainerSize({
        width: element.clientWidth,
        height: element.clientHeight
      });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setStagePosition({
      x: (width - gridPixelWidth) / 2,
      y: (height - gridPixelHeight) / 2
    });
  }, [gridPixelHeight, gridPixelWidth, height, layout.grid.columns, layout.grid.rows, width]);

  const pointerCell = (): GridCell | undefined => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return undefined;
    const scale = stage.scaleX();
    const x = (pointer.x - stage.x()) / scale;
    const y = (pointer.y - stage.y()) / scale;
    const cell = pointToCell(x, y, cellSize);
    return inBounds(cell, layout.grid) ? cell : undefined;
  };

  const applyTool = (cell: GridCell) => {
    if (activeTool === "eraser") eraseCell(cell);
    else if (activeTool === "rack") addRack(cell);
    else if (activeTool === "station") addStation(cell);
    else if (activeTool === "charger") addCharger(cell, 1);
    else if (activeTool === "parking") addParking(cell);
    else if (activeTool === "rotation") addRotation(cell);
    else if (toolToCellType[activeTool]) drawCell(cell, toolToCellType[activeTool]!);
  };
  const isPaintTool = activeTool === "eraser" || Boolean(toolToCellType[activeTool]);
  const paintCell = (cell: GridCell) => {
    const key = `${cell.row}:${cell.col}`;
    if (lastPaintedCellRef.current === key) return;
    lastPaintedCellRef.current = key;
    applyTool(cell);
  };

  const selectionRect =
    selectionStart && selectionEnd
      ? {
          x: Math.min(selectionStart.col, selectionEnd.col) * cellSize,
          y: Math.min(selectionStart.row, selectionEnd.row) * cellSize,
          width: (Math.abs(selectionStart.col - selectionEnd.col) + 1) * cellSize,
          height: (Math.abs(selectionStart.row - selectionEnd.row) + 1) * cellSize
        }
      : undefined;
  const selectedCellRect = selectedCell
    ? {
        x: selectedCell.col * cellSize,
        y: selectedCell.row * cellSize,
        width: cellSize,
        height: cellSize
      }
      : undefined;
  const hoverCellType = hoverCell ? layout.cells.find((cell) => cellKey(cell) === cellKey(hoverCell))?.cellType ?? "EMPTY" : undefined;
  const hoverObject = hoverCell
    ? layout.racks.find((rack) => rackOccupiedCells(rack, layout.grid).some((cell) => cellKey(cell) === cellKey(hoverCell)))?.rackId ??
      layout.stations.find((station) => cellKey(station.cell) === cellKey(hoverCell))?.stationId ??
      layout.chargingSpots.find((charger) => charger.cells.some((cell) => cellKey(cell) === cellKey(hoverCell)))?.chargerId ??
      layout.parkingSpots.find((parking) => cellKey(parking.cell) === cellKey(hoverCell))?.parkingId ??
      layout.rotationZones.find((zone) => zone.cells.some((cell) => cellKey(cell) === cellKey(hoverCell)))?.rotationZoneId
    : undefined;

  return (
    <div ref={containerRef} className="relative h-full overflow-hidden bg-slate-100">
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        x={stagePosition.x}
        y={stagePosition.y}
        scaleX={zoom}
        scaleY={zoom}
        draggable={activeTool === "pan"}
        className="cursor-crosshair"
        onDragEnd={(event) => {
          if (event.target === event.target.getStage()) {
            setStagePosition({ x: event.target.x(), y: event.target.y() });
          }
        }}
        onMouseDown={(event) => {
          const cell = pointerCell();
          if (!cell) return;
          if (activeTool === "traffic") {
            selectCell(cell);
          } else if (activeTool === "select" && event.target === event.target.getStage()) {
            clearSelection();
            setSelectionStart(cell);
            setSelectionEnd(cell);
          } else if (activeTool !== "select" && activeTool !== "pan") {
            if (isPaintTool) {
              isPaintingRef.current = true;
              lastPaintedCellRef.current = undefined;
              paintCell(cell);
            } else {
              applyTool(cell);
            }
          }
        }}
        onMouseMove={() => {
          const cell = pointerCell();
          setHoverCell(cell);
          if (isPaintingRef.current && isPaintTool && cell) paintCell(cell);
          if (selectionStart && cell) setSelectionEnd(cell);
        }}
        onMouseUp={() => {
          isPaintingRef.current = false;
          lastPaintedCellRef.current = undefined;
          if (selectionStart && selectionEnd) {
            const cells = new Set(rectCells(selectionStart, selectionEnd).map((cell) => `${cell.row}:${cell.col}`));
            const refs = [
              ...layout.racks.filter((rack) => rackOccupiedCells(rack, layout.grid).some((cell) => cells.has(`${cell.row}:${cell.col}`))).map((rack) => ({ kind: "rack" as const, id: rack.id })),
              ...layout.stations.filter((station) => cells.has(`${station.cell.row}:${station.cell.col}`)).map((station) => ({ kind: "station" as const, id: station.id })),
              ...layout.chargingSpots.filter((charger) => cells.has(`${charger.cells[0].row}:${charger.cells[0].col}`)).map((charger) => ({ kind: "charger" as const, id: charger.id })),
              ...layout.parkingSpots.filter((parking) => cells.has(`${parking.cell.row}:${parking.cell.col}`)).map((parking) => ({ kind: "parking" as const, id: parking.id })),
              ...layout.rotationZones.filter((zone) => cells.has(`${zone.cells[0].row}:${zone.cells[0].col}`)).map((zone) => ({ kind: "rotation" as const, id: zone.id }))
            ];
            setSelection(refs);
          }
          setSelectionStart(undefined);
          setSelectionEnd(undefined);
        }}
        onMouseLeave={() => {
          isPaintingRef.current = false;
          lastPaintedCellRef.current = undefined;
          setHoverCell(undefined);
        }}
      >
        <CellLayer cells={layout.cells} cellSize={cellSize} issueCells={validation.issueCells} />
        <HeatmapLayer layout={layout} analytics={analytics} validation={validation} cellSize={cellSize} visible={showHeatmap} mode={heatmapMode} />
        <GridLayer grid={layout.grid} cellSize={cellSize} visible={showGrid} />
        <DirectionArrowLayer layout={layout} cellSize={cellSize} visible={showDirectionArrows} />
        <ObjectLayer
          layout={layout}
          selected={selected}
          validation={validation}
          cellSize={cellSize}
          showLabels={showLabels}
          onSelect={selectObject}
          onMove={(ref, row, col) => moveObject(ref, { row, col })}
        />
        <SelectionLayer rect={selectionRect ?? selectedCellRect} />
      </Stage>
      <div className="absolute bottom-3 left-3 rounded-md border border-border bg-white/90 px-2 py-1 text-xs text-muted-foreground shadow-panel">
        {layout.grid.rows} x {layout.grid.columns} grid - {layout.grid.cellWidthM} m cells - zoom {(zoom * 100).toFixed(0)}%
      </div>
      {hoverCell ? (
        <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-border bg-white/95 px-2 py-1 text-xs text-slate-700 shadow-panel">
          Row {hoverCell.row}, Col {hoverCell.col} - {hoverObject ?? hoverCellType}
        </div>
      ) : null}
    </div>
  );
}

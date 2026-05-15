import { useEffect, useRef, useState } from "react";
import { Layer, Stage } from "react-konva";
import type Konva from "konva";
import type { CellType, GridCell } from "../../models/grid";
import type { AnalyticsResult } from "../../analytics/types";
import type { ValidationResult } from "../../validation/validateLayout";
import { useCurrentLayout, useLayoutStore } from "../../store/layoutStore";
import { useUiStore } from "../../store/uiStore";
import { useSimulationStore } from "../../store/simulationStore";
import { pointToCell } from "../../utils/geometry";
import { cellKey, inBounds, rectCells } from "../../utils/gridMath";
import { rackOccupiedCells } from "../../utils/rackFootprint";
import { exportStagePng } from "../../importExport/exportImage";
import { CellLayer } from "./CellLayer";
import { DirectionArrowLayer } from "./DirectionArrowLayer";
import { GridLayer } from "./GridLayer";
import { HeatmapLayer } from "./HeatmapLayer";
import { ObjectLayer } from "./ObjectLayer";
import { PathLayer } from "./PathLayer";
import { ReservationLayer } from "./ReservationLayer";
import { RobotLayer } from "./RobotLayer";
import { SelectionLayer } from "./SelectionLayer";
import { SimulationOverlayLayer } from "./SimulationOverlayLayer";
import { CanvasViewControls } from "./CanvasViewControls";
import { clampZoom, fitLayoutToCanvas, zoomAroundPointer, type Point } from "../../utils/viewMath";

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
  const { activeTool, appMode, zoom, setZoom, showGrid, showLabels, showDirectionArrows, showHeatmap, heatmapMode, hoverCell, setHoverCell } = useUiStore();
  const simulation = useSimulationStore((state) => state.state);
  const simulationConfig = useSimulationStore((state) => state.config);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const isPaintingRef = useRef(false);
  const lastPaintedCellRef = useRef<string | undefined>(undefined);
  const isNavigationPanningRef = useRef(false);
  const lastPanPointerRef = useRef<Point | undefined>(undefined);
  const spacePressedRef = useRef(false);
  const [containerSize, setContainerSize] = useState({ width: 900, height: 620 });
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [selectionStart, setSelectionStart] = useState<GridCell | undefined>();
  const [selectionEnd, setSelectionEnd] = useState<GridCell | undefined>();
  const cellSize = 22;
  const designLocked = appMode === "simulation";
  const gridPixelWidth = layout.grid.columns * cellSize;
  const gridPixelHeight = layout.grid.rows * cellSize;
  const width = Math.max(320, containerSize.width);
  const height = Math.max(320, containerSize.height);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable;
      if (event.code === "Space" && !isTyping) {
        spacePressedRef.current = true;
        event.preventDefault();
      }
      if (event.key === "Delete" || event.key === "Backspace") deleteSelected();
      if (event.key.toLowerCase() === "r") rotateSelected();
      if (meta && event.key.toLowerCase() === "c") copySelected();
      if (meta && event.key.toLowerCase() === "v") pasteClipboard();
      if (meta && event.key.toLowerCase() === "z") useLayoutStore.getState().undo();
      if (meta && event.key.toLowerCase() === "y") useLayoutStore.getState().redo();
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spacePressedRef.current = false;
    };
    const exportPng = () => {
      if (stageRef.current) exportStagePng(stageRef.current);
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("rmfs-export-png", exportPng);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKeyUp);
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

  const fitView = () => {
    const fitted = fitLayoutToCanvas({
      canvasWidth: width,
      canvasHeight: height,
      gridColumns: layout.grid.columns,
      gridRows: layout.grid.rows,
      cellSizePx: cellSize,
      paddingPx: 28
    });
    setZoom(fitted.zoom);
    setStagePosition(fitted.position);
  };

  const resetView = () => {
    setZoom(1);
    setStagePosition({
      x: (width - gridPixelWidth) / 2,
      y: (height - gridPixelHeight) / 2
    });
  };

  const zoomAtCanvasPoint = (pointer: Point, nextZoom: number) => {
    const clamped = clampZoom(nextZoom);
    setStagePosition(zoomAroundPointer({ pointer, stagePosition, oldZoom: zoom, newZoom: clamped }));
    setZoom(clamped);
  };

  const zoomAtCenter = (nextZoom: number) => {
    zoomAtCanvasPoint({ x: width / 2, y: height / 2 }, nextZoom);
  };

  useEffect(() => {
    fitView();
    // Fit only on layout/container changes. User pan/zoom should not be recentered on every zoom update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, layout.grid.columns, layout.grid.rows, width]);

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
      layout.parkingSpots.find((parking) => cellKey(parking.cell) === cellKey(hoverCell))?.parkingId
    : undefined;

  return (
    <div
      ref={containerRef}
      data-testid="layout-canvas"
      data-stage-x={stagePosition.x.toFixed(2)}
      data-stage-y={stagePosition.y.toFixed(2)}
      data-zoom={zoom.toFixed(4)}
      className="relative h-full overflow-hidden bg-slate-100"
      onContextMenu={(event) => event.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        x={stagePosition.x}
        y={stagePosition.y}
        scaleX={zoom}
        scaleY={zoom}
        draggable={false}
        className="cursor-crosshair"
        onWheel={(event) => {
          event.evt.preventDefault();
          const pointer = stageRef.current?.getPointerPosition();
          if (!pointer) return;
          const factor = event.evt.deltaY > 0 ? 1 / 1.12 : 1.12;
          zoomAtCanvasPoint(pointer, zoom * factor);
        }}
        onMouseDown={(event) => {
          const pointer = stageRef.current?.getPointerPosition();
          const navigationPan = activeTool === "pan" || spacePressedRef.current || event.evt.button === 1 || event.evt.button === 2;
          if (navigationPan && pointer) {
            isNavigationPanningRef.current = true;
            lastPanPointerRef.current = pointer;
            isPaintingRef.current = false;
            return;
          }
          const cell = pointerCell();
          if (!cell) return;
          if (designLocked) {
            selectCell(cell);
            return;
          }
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
          if (isNavigationPanningRef.current) {
            const pointer = stageRef.current?.getPointerPosition();
            const previous = lastPanPointerRef.current;
            if (pointer && previous) {
              setStagePosition((position) => ({
                x: position.x + pointer.x - previous.x,
                y: position.y + pointer.y - previous.y
              }));
              lastPanPointerRef.current = pointer;
            }
            return;
          }
          const cell = pointerCell();
          setHoverCell(cell);
          if (!designLocked && isPaintingRef.current && isPaintTool && cell) paintCell(cell);
          if (selectionStart && cell) setSelectionEnd(cell);
        }}
        onMouseUp={() => {
          isNavigationPanningRef.current = false;
          lastPanPointerRef.current = undefined;
          isPaintingRef.current = false;
          lastPaintedCellRef.current = undefined;
          if (selectionStart && selectionEnd) {
            const cells = new Set(rectCells(selectionStart, selectionEnd).map((cell) => `${cell.row}:${cell.col}`));
            const refs = [
              ...layout.racks.filter((rack) => rackOccupiedCells(rack, layout.grid).some((cell) => cells.has(`${cell.row}:${cell.col}`))).map((rack) => ({ kind: "rack" as const, id: rack.id })),
              ...layout.stations.filter((station) => cells.has(`${station.cell.row}:${station.cell.col}`)).map((station) => ({ kind: "station" as const, id: station.id })),
              ...layout.chargingSpots.filter((charger) => cells.has(`${charger.cells[0].row}:${charger.cells[0].col}`)).map((charger) => ({ kind: "charger" as const, id: charger.id })),
              ...layout.parkingSpots.filter((parking) => cells.has(`${parking.cell.row}:${parking.cell.col}`)).map((parking) => ({ kind: "parking" as const, id: parking.id }))
            ];
            setSelection(refs);
          }
          setSelectionStart(undefined);
          setSelectionEnd(undefined);
        }}
        onMouseLeave={() => {
          isNavigationPanningRef.current = false;
          lastPanPointerRef.current = undefined;
          isPaintingRef.current = false;
          lastPaintedCellRef.current = undefined;
          setHoverCell(undefined);
        }}
      >
        <Layer>
          <CellLayer cells={layout.cells} cellSize={cellSize} issueCells={validation.issueCells} />
          <HeatmapLayer layout={layout} analytics={analytics} validation={validation} cellSize={cellSize} visible={showHeatmap} mode={heatmapMode} />
          <GridLayer grid={layout.grid} cellSize={cellSize} visible={showGrid} />
          <DirectionArrowLayer layout={layout} cellSize={cellSize} visible={showDirectionArrows} />
        </Layer>
        <Layer>
          <ObjectLayer
            layout={layout}
            selected={selected}
            validation={validation}
            cellSize={cellSize}
            showLabels={showLabels}
            onSelect={selectObject}
            onMove={(ref, row, col) => moveObject(ref, { row, col })}
            hiddenRackIds={new Set(simulation.robots.map((robot) => robot.carryingRackId).filter(Boolean) as string[])}
            draggableObjects={!designLocked}
          />
        </Layer>
        {appMode === "simulation" ? (
          <Layer>
            <ReservationLayer simulation={simulation} cellSize={cellSize} visible={appMode === "simulation" && simulationConfig.showReservations} />
            <PathLayer simulation={simulation} cellSize={cellSize} visible={simulationConfig.showPaths} />
            <RobotLayer layout={layout} simulation={simulation} cellSize={cellSize} showLabels={simulationConfig.showRobotLabels} showLoadedEnvelope={simulationConfig.showLoadedEnvelope} />
            <SimulationOverlayLayer layout={layout} simulation={simulation} cellSize={cellSize} />
          </Layer>
        ) : null}
        <Layer>
          <SelectionLayer rect={selectionRect ?? selectedCellRect} />
        </Layer>
      </Stage>
      <div className="absolute bottom-3 left-3 rounded-md border border-border bg-white/90 px-2 py-1 text-xs text-muted-foreground shadow-panel">
        {layout.grid.rows} x {layout.grid.columns} grid - {layout.grid.cellWidthM} m cells - zoom {(zoom * 100).toFixed(0)}%
      </div>
      <CanvasViewControls
        zoomPercent={`${(zoom * 100).toFixed(0)}%`}
        onFit={fitView}
        onReset={resetView}
        onZoomIn={() => zoomAtCenter(zoom * 1.15)}
        onZoomOut={() => zoomAtCenter(zoom / 1.15)}
      />
      {hoverCell ? (
        <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-border bg-white/95 px-2 py-1 text-xs text-slate-700 shadow-panel">
          Row {hoverCell.row}, Col {hoverCell.col} - {hoverObject ?? hoverCellType}
        </div>
      ) : null}
    </div>
  );
}

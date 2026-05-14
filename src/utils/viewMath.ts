export interface Point {
  x: number;
  y: number;
}

export interface FitViewInput {
  canvasWidth: number;
  canvasHeight: number;
  gridColumns: number;
  gridRows: number;
  cellSizePx: number;
  paddingPx?: number;
  minZoom?: number;
  maxZoom?: number;
}

export const MIN_CANVAS_ZOOM = 0.2;
export const MAX_CANVAS_ZOOM = 4;

export function clampZoom(zoom: number, minZoom = MIN_CANVAS_ZOOM, maxZoom = MAX_CANVAS_ZOOM) {
  if (Number.isNaN(zoom) || !Number.isFinite(zoom)) return 1;
  return Math.max(minZoom, Math.min(maxZoom, zoom));
}

export function fitLayoutToCanvas({
  canvasWidth,
  canvasHeight,
  gridColumns,
  gridRows,
  cellSizePx,
  paddingPx = 24,
  minZoom = MIN_CANVAS_ZOOM,
  maxZoom = MAX_CANVAS_ZOOM
}: FitViewInput): { zoom: number; position: Point } {
  const gridWidth = Math.max(1, gridColumns * cellSizePx);
  const gridHeight = Math.max(1, gridRows * cellSizePx);
  const availableWidth = Math.max(1, canvasWidth - paddingPx * 2);
  const availableHeight = Math.max(1, canvasHeight - paddingPx * 2);
  const zoom = clampZoom(Math.min(availableWidth / gridWidth, availableHeight / gridHeight), minZoom, maxZoom);
  return {
    zoom,
    position: {
      x: (canvasWidth - gridWidth * zoom) / 2,
      y: (canvasHeight - gridHeight * zoom) / 2
    }
  };
}

export function zoomAroundPointer({
  pointer,
  stagePosition,
  oldZoom,
  newZoom
}: {
  pointer: Point;
  stagePosition: Point;
  oldZoom: number;
  newZoom: number;
}): Point {
  const clampedOld = clampZoom(oldZoom);
  const clampedNew = clampZoom(newZoom);
  const layoutPoint = {
    x: (pointer.x - stagePosition.x) / clampedOld,
    y: (pointer.y - stagePosition.y) / clampedOld
  };
  return {
    x: pointer.x - layoutPoint.x * clampedNew,
    y: pointer.y - layoutPoint.y * clampedNew
  };
}

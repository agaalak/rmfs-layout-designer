import type { LayoutCell } from "../models/grid";
import { allDirections, type GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { RotationZone } from "../models/rotation";
import { makeQueueLaneFromCells } from "./queueLanes";
import { cellKey } from "./gridMath";

export const LAYOUT_SCHEMA_VERSION = "0.3.0";
export const APP_VERSION = "0.3.0";

type LegacyStation = WarehouseLayout["stations"][number] & {
  queueCells?: GridCell[];
  maxQueueLength?: number;
};

function upsertSemanticCell(cells: Map<string, LayoutCell>, cell: GridCell, patch: Partial<LayoutCell>) {
  const key = cellKey(cell);
  const existing = cells.get(key);
  cells.set(key, {
    row: cell.row,
    col: cell.col,
    cellType: existing?.cellType ?? "ROAD",
    allowedDirections: existing?.allowedDirections ?? allDirections,
    ...existing,
    ...patch
  });
}

function migrateRotationZones(layout: WarehouseLayout, cells: Map<string, LayoutCell>) {
  const zones = (layout.rotationZones ?? []) as RotationZone[];
  for (const zone of zones) {
    for (const zoneCell of zone.cells) {
      const existing = cells.get(cellKey(zoneCell));
      const cellType = (existing?.cellType as string | undefined) === "ROTATION" || !existing ? "ROAD" : existing.cellType;
      upsertSemanticCell(cells, zoneCell, {
        cellType,
        allowRotation: true,
        supportedRotationOrientationsDeg: zone.supportedOrientationsDeg,
        rotationTimeSec: zone.rotationTimeSec,
        rotationCapacity: 1,
        allowedRotationRackTypes: zone.allowedRackTypes,
        locked: existing?.locked ?? zone.locked
      });
    }
  }
}

function migrateQueueLanes(layout: WarehouseLayout, cells: Map<string, LayoutCell>) {
  const queueLanes = [...(layout.queueLanes ?? [])];
  const queueLaneIds = new Set(queueLanes.map((lane) => lane.queueLaneId));
  const stations = (layout.stations as LegacyStation[]).map((station, stationIndex) => {
    const legacyQueueCells = station.queueCells ?? [];
    const existingLaneIds = station.queueLaneIds ?? [];
    const generatedLaneId = `queue_${station.id || station.stationId || stationIndex}_001`;
    if (legacyQueueCells.length > 0 && !queueLaneIds.has(generatedLaneId) && existingLaneIds.length === 0) {
      const lane = makeQueueLaneFromCells(generatedLaneId, station.id, legacyQueueCells, station.cell, station.locked);
      if (lane) {
        queueLanes.push(lane);
        queueLaneIds.add(lane.queueLaneId);
        lane.cells.forEach((item) => {
          upsertSemanticCell(cells, item.cell, {
            cellType: "QUEUE",
            allowedDirections: [item.directionToNext]
          });
        });
      }
    }
    const laneIds = existingLaneIds.length > 0 ? existingLaneIds : legacyQueueCells.length > 0 ? [generatedLaneId] : [];
    return {
      id: station.id,
      stationId: station.stationId,
      stationType: station.stationType,
      cell: station.cell,
      serviceSide: station.serviceSide,
      acceptedRackFaces: station.acceptedRackFaces,
      requiredRackOrientationDeg: station.requiredRackOrientationDeg,
      targetServiceTimeSec: station.targetServiceTimeSec,
      capacity: station.capacity ?? 1,
      queueLaneIds: laneIds,
      locked: station.locked
    };
  });
  return { stations, queueLanes };
}

export function normalizeLayoutSemantics(layout: WarehouseLayout): WarehouseLayout {
  const cellMap = new Map<string, LayoutCell>();
  for (const cell of layout.cells ?? []) {
    const legacyType = cell.cellType as string;
    cellMap.set(cellKey(cell), {
      ...cell,
      cellType: legacyType === "ROTATION" ? "ROAD" : cell.cellType,
      allowRotation: cell.allowRotation || legacyType === "ROTATION" ? true : cell.allowRotation,
      supportedRotationOrientationsDeg: cell.supportedRotationOrientationsDeg ?? (legacyType === "ROTATION" ? [0, 90, 180, 270] : undefined),
      rotationTimeSec: cell.rotationTimeSec ?? (legacyType === "ROTATION" ? 6 : undefined),
      rotationCapacity: cell.rotationCapacity ?? (legacyType === "ROTATION" ? 1 : undefined)
    });
  }
  migrateRotationZones(layout, cellMap);
  const { stations, queueLanes } = migrateQueueLanes(layout, cellMap);
  const storageLocations = (layout.storageLocations ?? []).map((location) => ({
    ...location,
    podServiceCell: location.podServiceCell ?? location.cells[0]
  }));
  return {
    ...layout,
    layoutSchemaVersion: LAYOUT_SCHEMA_VERSION,
    appVersion: layout.appVersion ?? APP_VERSION,
    cells: [...cellMap.values()],
    stations,
    queueLanes,
    storageLocations,
    rotationZones: [],
    metadata: {
      ...layout.metadata,
      deprecatedRotationZonesMigrated: Boolean(layout.rotationZones?.length),
      queueStationPodRotationSemantics: "0.3.0"
    }
  };
}

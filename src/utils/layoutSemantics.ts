import type { LayoutCell } from "../models/grid";
import { allDirections, type GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { QueuePoint } from "../models/queuePoint";
import type { RotationZone } from "../models/rotation";
import { makeQueueLaneFromCells } from "./queueLanes";
import { cellKey } from "./gridMath";
import { deriveDirectedLinksFromCells } from "./directionLinks";

export const LAYOUT_SCHEMA_VERSION = "0.3.1";
export const APP_VERSION = "0.3.1";

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

function defaultStationQueuePolicy(station: { capacity?: number }) {
  return {
    requireQueuePointVisit: true,
    queuePointSelectionStrategy: "nearest_feasible" as const,
    sharedQueuePointsAllowed: true,
    stationCapacity: station.capacity ?? 1
  };
}

function migrateQueueLanes(layout: WarehouseLayout, cells: Map<string, LayoutCell>) {
  const queueLanes = [...(layout.queueLanes ?? [])];
  const queueLaneIds = new Set(queueLanes.map((lane) => lane.queueLaneId));
  const queuePoints: QueuePoint[] = [...((layout as WarehouseLayout & { queuePoints?: QueuePoint[] }).queuePoints ?? [])];
  const queuePointKeys = new Set(queuePoints.map((point) => `${cellKey(point.cell)}:${point.stationIds.join(",")}:${point.appliesToAllStations}`));
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
            cellType: "ROAD",
            allowedDirections: [item.directionToNext]
          });
        });
      }
    }
    const stationLaneIds = existingLaneIds.length > 0 ? existingLaneIds : legacyQueueCells.length > 0 ? [generatedLaneId] : [];
    const stationLanes = queueLanes.filter((lane) => stationLaneIds.includes(lane.queueLaneId));
    for (const [index, lane] of stationLanes.entries()) {
      const queuePointCell = lane.headCell ?? lane.cells.at(-1)?.cell ?? lane.entryCell;
      const key = `${cellKey(queuePointCell)}:${station.id}:false`;
      if (!queuePointKeys.has(key)) {
        queuePoints.push({
          queuePointId: `qp_${station.id}_${index + 1}`,
          cell: queuePointCell,
          appliesToAllStations: false,
          stationIds: [station.id],
          priority: index,
          capacity: 1,
          loadedOnly: true,
          waitPolicy: "OCCUPY_POINT",
          locked: lane.locked
        });
        queuePointKeys.add(key);
      }
      const existing = cells.get(cellKey(queuePointCell));
      upsertSemanticCell(cells, queuePointCell, {
        cellType: existing?.cellType === "STATION" ? "STATION" : "ROAD"
      });
    }
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
      queuePolicy: station.queuePolicy ?? defaultStationQueuePolicy(station),
      queueLaneIds: [],
      locked: station.locked
    };
  });

  for (const cell of [...cells.values()]) {
    if (cell.cellType !== "QUEUE") continue;
    const key = `${cellKey(cell)}::true`;
    if (!queuePointKeys.has(key)) {
      queuePoints.push({
        queuePointId: `qp_${cell.row}_${cell.col}`,
        cell: { row: cell.row, col: cell.col },
        appliesToAllStations: true,
        stationIds: [],
        priority: 100,
        capacity: 1,
        loadedOnly: true,
        waitPolicy: "OCCUPY_POINT",
        locked: cell.locked
      });
      queuePointKeys.add(key);
    }
    cells.set(cellKey(cell), { ...cell, cellType: "ROAD" });
  }

  return { stations, queuePoints };
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
  const { stations, queuePoints } = migrateQueueLanes(layout, cellMap);
  const storageLocations = (layout.storageLocations ?? []).map((location) => ({
    ...location,
    podServiceCell: location.podServiceCell ?? location.cells[0]
  }));
  const cells = [...cellMap.values()];
  const directedLinks = ((layout as WarehouseLayout & { directedLinks?: WarehouseLayout["directedLinks"] }).directedLinks?.length
    ? (layout as WarehouseLayout & { directedLinks?: WarehouseLayout["directedLinks"] }).directedLinks!
    : deriveDirectedLinksFromCells({ grid: layout.grid, cells }))
    .filter((link) => link.enabled !== false);
  return {
    ...layout,
    layoutSchemaVersion: LAYOUT_SCHEMA_VERSION,
    appVersion: layout.appVersion ?? APP_VERSION,
    cells,
    directedLinks,
    stations,
    queuePoints,
    queueLanes: [],
    storageLocations,
    rotationZones: [],
    metadata: {
      ...layout.metadata,
      deprecatedRotationZonesMigrated: Boolean(layout.rotationZones?.length),
      queueStationPodRotationSemantics: "0.3.1",
      deprecatedQueueLanesMigrated: Boolean(layout.queueLanes?.length)
    }
  };
}

import type { CellType, Direction, GridCell, LayoutCell } from "../models/grid";
import { allDirections } from "../models/grid";
import type { GenerationParams, LayoutCandidateSummary, WarehouseLayout } from "../models/layout";
import type { QueueLane } from "../models/queue";
import type { Rack, RackFace } from "../models/rack";
import type { Station, ServiceSide, StationType } from "../models/station";
import { serviceSideOrientation } from "../models/station";
import type { ChargingSpot } from "../models/charging";
import type { ParkingSpot } from "../models/parking";
import { runAnalytics } from "../analytics/runAnalytics";
import { validateLayout } from "../validation/validateLayout";
import { cellKey, deriveDimensions, inBounds, neighbors, spreadIndices } from "../utils/gridMath";
import { makeId, nextSequentialId } from "../utils/ids";
import { makeBinRecords } from "../utils/rackBins";
import { rackOccupiedCells } from "../utils/rackFootprint";
import { ensureStorageLocations } from "../utils/storageLocations";
import { APP_VERSION, LAYOUT_SCHEMA_VERSION, normalizeLayoutSemantics } from "../utils/layoutSemantics";
import { makeQueueLaneFromCells, stationQueueCells } from "../utils/queueLanes";

type CellMap = Map<string, CellType>;
type RotationCellMap = Map<string, Pick<LayoutCell, "allowRotation" | "supportedRotationOrientationsDeg" | "rotationTimeSec" | "rotationCapacity" | "allowedRotationRackTypes">>;

export const smallDemoGenerationParams: GenerationParams = {
  rows: 22,
  columns: 30,
  cellWidthM: 1.5,
  cellDepthM: 1.5,
  rackFootprintWidthM: 1.2,
  rackFootprintDepthM: 1.2,
  rackFillRatio: 0.09,
  verticalAisleSpacing: 5,
  horizontalCrossAisleSpacing: 7,
  stationCount: 3,
  stationPlacementStrategy: "external",
  chargerCount: 2,
  chargerSizeCells: 1,
  parkingSpotCount: 4,
  trafficMode: "two_way",
  rotationZoneCount: 4,
  candidateCount: 6,
  layoutFamily: "traditional_external"
};

export const largeDemoGenerationParams: GenerationParams = {
  rows: 40,
  columns: 60,
  cellWidthM: 1.5,
  cellDepthM: 1.5,
  rackFootprintWidthM: 1.2,
  rackFootprintDepthM: 1.2,
  rackFillRatio: 0.78,
  verticalAisleSpacing: 6,
  horizontalCrossAisleSpacing: 10,
  stationCount: 8,
  stationPlacementStrategy: "external",
  chargerCount: 8,
  chargerSizeCells: 1,
  parkingSpotCount: 12,
  trafficMode: "two_way",
  rotationZoneCount: 8,
  candidateCount: 10,
  layoutFamily: "traditional_external"
};

export const defaultGenerationParams: GenerationParams = smallDemoGenerationParams;

export function makeLayoutShell(params: GenerationParams, mode: WarehouseLayout["mode"]): WarehouseLayout {
  const grid = {
    rows: params.rows,
    columns: params.columns,
    cellWidthM: params.cellWidthM,
    cellDepthM: params.cellDepthM
  };
  return {
    layoutSchemaVersion: LAYOUT_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    layoutId: makeId("layout"),
    name: mode === "manual" ? "Manual RMFS Layout" : "Generated RMFS Layout",
    mode,
    grid,
    physicalDimensions: deriveDimensions(grid),
    cells: [],
    racks: [],
    storageLocations: [],
    stations: [],
    queueLanes: [],
    chargingSpots: [],
    parkingSpots: [],
    rotationZones: [],
    trafficRules: [],
    robotAssumptions: {
      robotCount: 25,
      unloadedSpeedMps: 1.5,
      loadedSpeedMps: 1.2,
      pickupTimeSec: 8,
      dropoffTimeSec: 8,
      stationServiceTimeSec: 30,
      rotationTimeSec: 6
    },
    demandAssumptions: {
      expectedOrdersPerHour: 300,
      averageLinesPerOrder: 1.4,
      averageRackVisitsPerOrder: 1.2
    },
    scoringWeights: {
      storageDensity: 0.2,
      averageDistance: 0.2,
      p90Distance: 0.1,
      stationBalance: 0.15,
      congestionRisk: 0.15,
      orientationPenalty: 0.1,
      chargingAccess: 0.05,
      parkingAccess: 0.05
    },
    metadata: {
      noRobotAnimation: true
    }
  };
}

export function createEmptyLayout(params: Partial<GenerationParams> = {}): WarehouseLayout {
  return makeLayoutShell({ ...defaultGenerationParams, ...params }, "manual");
}

function setCell(cells: CellMap, cell: GridCell, type: CellType) {
  cells.set(cellKey(cell), type);
}

function markPerimeter(cells: CellMap, rows: number, columns: number) {
  for (let row = 0; row < rows; row += 1) {
    setCell(cells, { row, col: 0 }, "ROAD");
    setCell(cells, { row, col: columns - 1 }, "ROAD");
  }
  for (let col = 0; col < columns; col += 1) {
    setCell(cells, { row: 0, col }, "ROAD");
    setCell(cells, { row: rows - 1, col }, "ROAD");
  }
}

function markAisles(cells: CellMap, params: GenerationParams, dense = false) {
  markPerimeter(cells, params.rows, params.columns);
  const verticalSpacing = dense ? Math.max(3, Math.min(4, params.verticalAisleSpacing)) : params.verticalAisleSpacing;
  const horizontalSpacing = dense
    ? Math.max(6, params.horizontalCrossAisleSpacing)
    : params.horizontalCrossAisleSpacing;
  for (let col = 1; col < params.columns - 1; col += 1) {
    if (col % verticalSpacing === 0) {
      for (let row = 1; row < params.rows - 1; row += 1) setCell(cells, { row, col }, "ROAD");
    }
  }
  for (let row = 1; row < params.rows - 1; row += 1) {
    if (row % horizontalSpacing === 0) {
      for (let col = 1; col < params.columns - 1; col += 1) setCell(cells, { row, col }, "ROAD");
    }
  }
}

function setRoadCorridor(cells: CellMap, cell: GridCell, params: GenerationParams, radius = 0) {
  for (let dr = -radius; dr <= radius; dr += 1) {
    for (let dc = -radius; dc <= radius; dc += 1) {
      const next = { row: cell.row + dr, col: cell.col + dc };
      if (inBounds(next, { rows: params.rows, columns: params.columns, cellWidthM: params.cellWidthM, cellDepthM: params.cellDepthM })) {
        setCell(cells, next, "ROAD");
      }
    }
  }
}

function diagonalCells(start: GridCell, end: GridCell): GridCell[] {
  const cells: GridCell[] = [];
  const steps = Math.max(Math.abs(end.row - start.row), Math.abs(end.col - start.col));
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    const row = Math.round(start.row + (end.row - start.row) * t);
    const col = Math.round(start.col + (end.col - start.col) * t);
    const previous = cells.at(-1);
    if (!previous || previous.row !== row || previous.col !== col) cells.push({ row, col });
  }
  return cells;
}

function markFlyingVRoads(cells: CellMap, params: GenerationParams) {
  markPerimeter(cells, params.rows, params.columns);
  const apex = { row: params.rows - 3, col: Math.floor(params.columns / 2) };
  const leftWing = { row: 2, col: 2 };
  const rightWing = { row: 2, col: params.columns - 3 };
  const corridorRadius = params.rows >= 28 && params.columns >= 36 ? 1 : 0;
  for (const cell of [...diagonalCells(apex, leftWing), ...diagonalCells(apex, rightWing)]) {
    setRoadCorridor(cells, cell, params, corridorRadius);
  }
  for (let row = 2; row < params.rows - 2; row += Math.max(4, params.horizontalCrossAisleSpacing)) {
    for (let col = 1; col < params.columns - 1; col += 1) setCell(cells, { row, col }, "ROAD");
  }
  for (let row = apex.row; row < params.rows - 1; row += 1) setCell(cells, { row, col: apex.col }, "ROAD");
  for (let col = Math.max(1, apex.col - 5); col <= Math.min(params.columns - 2, apex.col + 5); col += 1) {
    setCell(cells, { row: apex.row, col }, "ROAD");
  }
}

function makeQueue(cell: GridCell, side: ServiceSide, length: number, params: GenerationParams): GridCell[] {
  const delta: Record<ServiceSide, [number, number]> = {
    NORTH: [1, 0],
    SOUTH: [-1, 0],
    EAST: [0, -1],
    WEST: [0, 1]
  };
  const [dr, dc] = delta[side];
  const result: GridCell[] = [];
  for (let i = 1; i <= length; i += 1) {
    const next = { row: cell.row + dr * i, col: cell.col + dc * i };
    if (inBounds(next, { rows: params.rows, columns: params.columns, cellWidthM: params.cellWidthM, cellDepthM: params.cellDepthM })) {
      result.push(next);
    }
  }
  return result;
}

function addStation(
  cells: CellMap,
  stations: Station[],
  queueLanes: QueueLane[],
  cell: GridCell,
  side: ServiceSide,
  type: StationType,
  params: GenerationParams
) {
  const queueCells = makeQueue(cell, side, 4, params);
  setCell(cells, cell, "STATION");
  queueCells.forEach((queue) => setCell(cells, queue, "QUEUE"));
  const stationId = makeId("station");
  const lane = makeQueueLaneFromCells(`queue_${stationId}_001`, stationId, [...queueCells].reverse(), cell);
  if (lane) {
    queueLanes.push(lane);
    lane.cells.forEach((item) => setCell(cells, item.cell, "QUEUE"));
  }
  stations.push({
    id: stationId,
    stationId: nextSequentialId(type.toLowerCase(), stations.length),
    stationType: type,
    cell,
    serviceSide: side,
    acceptedRackFaces: ["A", "B"],
    requiredRackOrientationDeg: serviceSideOrientation[side],
    targetServiceTimeSec: 30,
    capacity: 1,
    queueLaneIds: lane ? [lane.queueLaneId] : []
  });
}

function addExternalStations(cells: CellMap, stations: Station[], queueLanes: QueueLane[], params: GenerationParams) {
  const cols = spreadIndices(params.stationCount, 3, params.columns - 4);
  cols.forEach((col, index) => {
    const side: ServiceSide = index % 2 === 0 ? "SOUTH" : "NORTH";
    addStation(
      cells,
      stations,
      queueLanes,
      { row: side === "SOUTH" ? params.rows - 1 : 0, col },
      side,
      index < 6 ? "PICK" : "REPLENISH",
      params
    );
  });
}

function addInternalStations(cells: CellMap, stations: Station[], queueLanes: QueueLane[], params: GenerationParams, distributed: boolean) {
  const rows = distributed
    ? spreadIndices(params.stationCount, Math.max(4, Math.floor(params.rows / 5)), Math.min(params.rows - 5, Math.floor((params.rows * 4) / 5)))
    : Array.from({ length: params.stationCount }, () => Math.floor(params.rows / 2));
  const cols = spreadIndices(params.stationCount, Math.floor(params.columns / 4), Math.floor((params.columns * 3) / 4));
  cols.forEach((col, index) => {
    const side: ServiceSide = index % 2 === 0 ? "NORTH" : "SOUTH";
    addStation(cells, stations, queueLanes, { row: rows[index] ?? Math.floor(params.rows / 2), col }, side, index < 6 ? "PICK" : "REPLENISH", params);
  });
}

function addFlyingVStations(cells: CellMap, stations: Station[], queueLanes: QueueLane[], params: GenerationParams) {
  const apexRow = params.rows - 1;
  const center = Math.floor(params.columns / 2);
  const cols = spreadIndices(params.stationCount, Math.max(2, center - 8), Math.min(params.columns - 3, center + 8));
  cols.forEach((col, index) => {
    addStation(cells, stations, queueLanes, { row: apexRow, col }, "SOUTH", index < Math.ceil(params.stationCount * 0.75) ? "PICK" : "REPLENISH", params);
  });
}

export function makeRackBins(
  rackId: string,
  faceId: "A" | "B",
  rows: number,
  columns: number,
  widthM = 0.3,
  depthM = 0.4,
  heightM = 0.3,
  barcodePrefix = rackId,
  locationPrefix = rackId
) {
  return makeBinRecords(rackId, faceId, rows, columns, { widthM, depthM, heightM, barcodePrefix, locationPrefix });
}

const demoSkus = ["SKU-HOT-001", "SKU-HOT-002", "SKU-WARM-001", "SKU-WARM-002", "SKU-COLD-001", "SKU-COLD-002"];

function makeFaces(rackId: string, rackIndex = 0): RackFace[] {
  return ["A", "B"].map((faceId) => ({
    faceId: faceId as "A" | "B",
    localSide: faceId === "A" ? "FRONT" : "BACK",
    rows: 4,
    columns: 3,
    bins: makeRackBins(rackId, faceId as "A" | "B", 4, 3).map((bin, binIndex) => {
      const sku = demoSkus[(rackIndex + binIndex) % demoSkus.length];
      return {
        ...bin,
        sku,
        quantity: 8 + ((rackIndex + binIndex) % 7),
        reservedQuantity: 0,
        maxQuantity: 40
      };
    })
  }));
}

function addRacks(cells: CellMap, racks: Rack[], params: GenerationParams) {
  const candidates: GridCell[] = [];
  const grid = { rows: params.rows, columns: params.columns, cellWidthM: params.cellWidthM, cellDepthM: params.cellDepthM };
  const footprintColumns = Math.max(1, Math.ceil(params.rackFootprintWidthM / params.cellWidthM));
  const footprintRows = Math.max(1, Math.ceil(params.rackFootprintDepthM / params.cellDepthM));
  const occupiedForCandidate = (cell: GridCell) => {
    const result: GridCell[] = [];
    for (let rowOffset = 0; rowOffset < footprintRows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < footprintColumns; colOffset += 1) {
        result.push({ row: cell.row + rowOffset, col: cell.col + colOffset });
      }
    }
    return result;
  };
  for (let row = 1; row < params.rows - 1; row += 1) {
    for (let col = 1; col < params.columns - 1; col += 1) {
      const cell = { row, col };
      const occupied = occupiedForCandidate(cell);
      if (occupied.some((item) => !inBounds(item, grid) || cells.has(cellKey(item)))) continue;
      if (occupied.some((item) => neighbors(item, grid).some((neighborCell) => cells.get(cellKey(neighborCell)) === "ROAD" || cells.get(cellKey(neighborCell)) === "QUEUE"))) {
        candidates.push(cell);
      }
    }
  }
  const count = Math.max(1, Math.floor(candidates.length * params.rackFillRatio));
  candidates.slice(0, count).forEach((cell, index) => {
    const occupied = occupiedForCandidate(cell);
    if (occupied.some((item) => cells.has(cellKey(item)))) return;
    const rackId = nextSequentialId("rack", index);
    const demandClass = index < count * 0.25 ? "HOT" : index < count * 0.65 ? "WARM" : "COLD";
    occupied.forEach((rackCell) => setCell(cells, rackCell, "RACK_STORAGE"));
    racks.push({
      id: makeId("rack"),
      rackId,
      rackTypeId: "two_face_mobile_rack",
      homeCell: cell,
      footprintWidthM: params.rackFootprintWidthM,
      footprintDepthM: params.rackFootprintDepthM,
      heightM: 1.8,
      currentOrientationDeg: 0,
      allowedOrientationsDeg: [0, 90, 180, 270],
      faces: makeFaces(rackId, index),
      storageZoneId: demandClass.toLowerCase(),
      demandClass,
      operationalStatus: "STORED"
    });
  });
}

function addChargers(cells: CellMap, chargers: ChargingSpot[], params: GenerationParams) {
  for (let col = 2; col < params.columns - 2 && chargers.length < params.chargerCount; col += 3) {
    const chargerCells = [{ row: 1, col }];
    if (params.chargerSizeCells === 2) chargerCells.push({ row: 1, col: col + 1 });
    if (chargerCells.some((cell) => cells.has(cellKey(cell)))) continue;
    chargerCells.forEach((cell) => setCell(cells, cell, "CHARGING"));
    chargers.push({
      id: makeId("charger"),
      chargerId: nextSequentialId("charger", chargers.length),
      cells: chargerCells,
      capacityRobots: params.chargerSizeCells,
      chargerType: "standard"
    });
  }
}

function addParking(cells: CellMap, parking: ParkingSpot[], params: GenerationParams) {
  for (let col = params.columns - 3; col > 1 && parking.length < params.parkingSpotCount; col -= 3) {
    const cell = { row: params.rows - 2, col };
    if (cells.has(cellKey(cell))) continue;
    setCell(cells, cell, "PARKING");
    parking.push({
      id: makeId("parking"),
      parkingId: nextSequentialId("parking", parking.length),
      cell,
      parkingType: "IDLE"
    });
  }
}

function queueDeltaForSide(side: ServiceSide): [number, number] {
  const delta: Record<ServiceSide, [number, number]> = {
    NORTH: [1, 0],
    SOUTH: [-1, 0],
    EAST: [0, -1],
    WEST: [0, 1]
  };
  return delta[side];
}

function isRotationCellAvailable(cells: CellMap, cell: GridCell, params: GenerationParams) {
  const grid = { rows: params.rows, columns: params.columns, cellWidthM: params.cellWidthM, cellDepthM: params.cellDepthM };
  if (!inBounds(cell, grid)) return false;
  return !["STATION", "QUEUE", "CHARGING", "PARKING", "BLOCKED", "HUMAN_ZONE", "DOCK", "RACK_STORAGE"].includes(
    cells.get(cellKey(cell)) ?? "EMPTY"
  );
}

function pushRotation(cells: CellMap, rotationCells: RotationCellMap, cell: GridCell) {
  setCell(cells, cell, "ROAD");
  rotationCells.set(cellKey(cell), {
    allowRotation: true,
    supportedRotationOrientationsDeg: [0, 90, 180, 270],
    rotationTimeSec: 6,
    rotationCapacity: 1,
    allowedRotationRackTypes: ["two_face_mobile_rack"]
  });
}

function stationRotationCandidates(station: Station, queueCells: GridCell[]): GridCell[] {
  const [dr, dc] = queueDeltaForSide(station.serviceSide);
  const right: [number, number] = [dc, -dr];
  const left: [number, number] = [-dc, dr];
  const queueEnd = queueCells.at(-1) ?? station.cell;
  const firstQueue = queueCells[0] ?? station.cell;
  return [
    { row: queueEnd.row + dr, col: queueEnd.col + dc },
    { row: station.cell.row + right[0], col: station.cell.col + right[1] },
    { row: station.cell.row + left[0], col: station.cell.col + left[1] },
    { row: firstQueue.row + right[0], col: firstQueue.col + right[1] },
    { row: firstQueue.row + left[0], col: firstQueue.col + left[1] },
    { row: queueEnd.row + right[0], col: queueEnd.col + right[1] },
    { row: queueEnd.row + left[0], col: queueEnd.col + left[1] }
  ];
}

function addRotationCells(cells: CellMap, rotationCells: RotationCellMap, params: GenerationParams, stations: Station[], queueLanes: QueueLane[]) {
  const targetCount = Math.max(params.rotationZoneCount, stations.length * 2);
  for (const station of stations) {
    if (rotationCells.size >= targetCount) break;
    let addedForStation = 0;
    for (const candidate of stationRotationCandidates(station, stationQueueCells({ queueLanes }, station))) {
      if (addedForStation >= 2 || rotationCells.size >= targetCount) break;
      if (!isRotationCellAvailable(cells, candidate, params)) continue;
      pushRotation(cells, rotationCells, candidate);
      addedForStation += 1;
    }
  }

  for (let row = 2; row < params.rows - 2 && rotationCells.size < targetCount; row += 4) {
    for (let col = 2; col < params.columns - 2 && rotationCells.size < targetCount; col += 5) {
      const cell = { row, col };
      if (cells.get(cellKey(cell)) !== "ROAD") continue;
      pushRotation(cells, rotationCells, cell);
    }
  }
}

function materializeCells(cells: CellMap, trafficMode: GenerationParams["trafficMode"], rotationCells: RotationCellMap, queueLanes: QueueLane[]): LayoutCell[] {
  const directions: Direction[] = trafficMode === "two_way" ? allDirections : ["east", "south"];
  const queueDirectionByCell = new Map(queueLanes.flatMap((lane) => lane.cells.map((item) => [cellKey(item.cell), item.directionToNext] as const)));
  return [...cells.entries()].map(([key, cellType]) => {
    const [row, col] = key.split(":").map(Number);
    const queueDirection = queueDirectionByCell.get(key);
    return { row, col, cellType, allowedDirections: queueDirection ? [queueDirection] : directions, ...(rotationCells.get(key) ?? {}) };
  });
}

export function generateProceduralLayout(params: GenerationParams): WarehouseLayout {
  const layout = makeLayoutShell(params, "procedural");
  const cells: CellMap = new Map();
  const stations: Station[] = [];
  const queueLanes: QueueLane[] = [];
  const racks: Rack[] = [];
  const chargers: ChargingSpot[] = [];
  const parking: ParkingSpot[] = [];
  const rotationCells: RotationCellMap = new Map();

  if (params.layoutFamily === "true_flying_v") markFlyingVRoads(cells, params);
  else markAisles(cells, params, params.layoutFamily === "dense_with_cross_aisles");

  if (params.layoutFamily === "true_flying_v") addFlyingVStations(cells, stations, queueLanes, params);
  else if (params.layoutFamily === "internal_centralized") addInternalStations(cells, stations, queueLanes, params, false);
  else if (params.layoutFamily === "internal_distributed") addInternalStations(cells, stations, queueLanes, params, true);
  else if (params.layoutFamily === "hybrid_external_internal") {
    addExternalStations(cells, stations, queueLanes, { ...params, stationCount: Math.ceil(params.stationCount / 2) });
    addInternalStations(cells, stations, queueLanes, { ...params, stationCount: Math.floor(params.stationCount / 2) }, true);
  } else addExternalStations(cells, stations, queueLanes, params);

  addChargers(cells, chargers, params);
  addParking(cells, parking, params);
  addRotationCells(cells, rotationCells, params, stations, queueLanes);
  addRacks(cells, racks, params);

  return ensureStorageLocations(normalizeLayoutSemantics({
    ...layout,
    name: params.rows <= 24 && params.columns <= 32 ? "Small RMFS Demo Layout" : "Mode B Generated Layout",
    modifiedAt: new Date().toISOString(),
    cells: materializeCells(cells, params.trafficMode, rotationCells, queueLanes),
    racks,
    stations,
    queueLanes,
    chargingSpots: chargers,
    parkingSpots: parking,
    rotationZones: [],
    simulationConfig: params.rows <= 24 && params.columns <= 32
      ? ({
          ...(layout.simulationConfig ?? {}),
          robotCount: 4,
          taskCount: 6,
          unloadedSpeedMps: 2.4,
          loadedSpeedMps: 2,
          liftTimeSec: 4,
          dropTimeSec: 4,
          stationServiceTimeSec: 18,
          stationAssignmentStrategy: "shortest_queue"
        } as WarehouseLayout["simulationConfig"])
      : layout.simulationConfig,
    metadata: {
      ...layout.metadata,
      layoutFamily: params.layoutFamily,
      demoSize: params.rows <= 24 && params.columns <= 32 ? "small" : params.rows >= 40 && params.columns >= 60 ? "large" : "custom"
    }
  }));
}

function applyCurrentCustomSmallDemoDefault(layout: WarehouseLayout): WarehouseLayout {
  const removedStation = layout.stations.find((station) => station.stationId === "pick_002");
  if (!removedStation) return layout;
  const removedLaneIds = new Set(removedStation.queueLaneIds);
  const removedCells = new Set<string>([cellKey(removedStation.cell)]);
  for (const lane of layout.queueLanes) {
    if (!removedLaneIds.has(lane.queueLaneId)) continue;
    for (const item of lane.cells) removedCells.add(cellKey(item.cell));
  }
  const cells = layout.cells.map((cell) =>
    removedCells.has(cellKey(cell))
      ? {
          ...cell,
          cellType: "ROAD" as const,
          allowedDirections: allDirections,
          allowRotation: undefined,
          supportedRotationOrientationsDeg: undefined,
          rotationTimeSec: undefined,
          rotationCapacity: undefined,
          allowedRotationRackTypes: undefined
        }
      : cell
  );
  return normalizeLayoutSemantics({
    ...layout,
    cells,
    stations: layout.stations.filter((station) => station.id !== removedStation.id),
    queueLanes: layout.queueLanes.filter((lane) => !removedLaneIds.has(lane.queueLaneId)),
    metadata: {
      ...layout.metadata,
      defaultLayoutSource: "user_custom_layout_g3oeuj_0w3t",
      removedDemoStationId: removedStation.stationId
    }
  });
}

export function generateSmallDemoLayout(): WarehouseLayout {
  const layout = applyCurrentCustomSmallDemoDefault(generateProceduralLayout(smallDemoGenerationParams));
  return {
    ...layout,
    name: "Small RMFS Demo Layout",
    metadata: { ...layout.metadata, demoPreset: "small" }
  };
}

export function generateLargeDemoLayout(): WarehouseLayout {
  const layout = generateProceduralLayout(largeDemoGenerationParams);
  return {
    ...layout,
    name: "Large RMFS Stress Demo Layout",
    metadata: { ...layout.metadata, demoPreset: "large" }
  };
}

const candidateFamilies: GenerationParams["layoutFamily"][] = [
  "traditional_external",
  "internal_centralized",
  "internal_distributed",
  "hybrid_external_internal",
  "dense_with_cross_aisles",
  "true_flying_v"
];

function quickCandidateScore(layout: WarehouseLayout) {
  const stationCells = layout.stations.map((station) => station.cell);
  const averageStationDistance =
    layout.racks.length === 0 || stationCells.length === 0
      ? 999
      : layout.racks.reduce((sum, rack) => {
          const nearest = Math.min(
            ...stationCells.map((stationCell) => Math.abs(stationCell.row - rack.homeCell.row) + Math.abs(stationCell.col - rack.homeCell.col))
          );
          return sum + nearest;
        }, 0) / layout.racks.length;
  const density = layout.racks.length / Math.max(1, layout.grid.rows * layout.grid.columns);
  return density * 100 - averageStationDistance;
}

export function generateProceduralCandidates(params: GenerationParams): WarehouseLayout[] {
  const count = Math.max(1, Math.floor(params.candidateCount || 1));
  return Array.from({ length: count }, (_, index) => {
    const layoutFamily = index === 0 ? params.layoutFamily : candidateFamilies[index % candidateFamilies.length];
    const fillOffset = ((index % 5) - 2) * 0.04;
    const verticalOffset = index % 3;
    const horizontalOffset = index % 4;
    const candidate = generateProceduralLayout({
      ...params,
      layoutFamily,
      rackFillRatio: Math.max(0.2, Math.min(0.92, params.rackFillRatio + fillOffset)),
      verticalAisleSpacing: Math.max(3, params.verticalAisleSpacing + verticalOffset),
      horizontalCrossAisleSpacing: Math.max(4, params.horizontalCrossAisleSpacing + horizontalOffset)
    });
    candidate.layoutId = makeId("candidate");
    candidate.metadata = {
      ...candidate.metadata,
      candidateId: `candidate_${String(index + 1).padStart(3, "0")}`,
      candidateIndex: index + 1,
      candidateScore: quickCandidateScore(candidate),
      generatedCandidateCount: count
    };
    return candidate;
  });
}

export function summarizeCandidate(layout: WarehouseLayout): LayoutCandidateSummary {
  const analytics = runAnalytics(layout);
  const validation = validateLayout(layout);
  return {
    candidateId: String(layout.metadata.candidateId ?? layout.layoutId),
    layoutId: layout.layoutId,
    layoutFamily: (layout.metadata.layoutFamily ?? "traditional_external") as GenerationParams["layoutFamily"],
    rackCount: layout.racks.length,
    stationCount: layout.stations.length,
    chargerCount: layout.chargingSpots.length,
    parkingCount: layout.parkingSpots.length,
    storageDensity: analytics.storage.storageDensity,
    averageRackToStationDistance: analytics.distance.averageRackToNearestStationDistance,
    p90RackToStationDistance: analytics.distance.p90RackToNearestStationDistance,
    congestionRiskScore: analytics.congestion.congestionRiskScore,
    orientationPenaltyScore: analytics.scoring.orientationPenaltyScore,
    overallLayoutScore: analytics.scoring.overallLayoutScore,
    validationErrorCount: validation.issues.filter((issue) => issue.severity === "error").length
  };
}

export function summarizeCandidates(candidates: WarehouseLayout[]): LayoutCandidateSummary[] {
  return candidates.map(summarizeCandidate);
}

export function sortCandidateSummaries(
  summaries: LayoutCandidateSummary[],
  sortKey: keyof Pick<
    LayoutCandidateSummary,
    | "overallLayoutScore"
    | "storageDensity"
    | "averageRackToStationDistance"
    | "p90RackToStationDistance"
    | "congestionRiskScore"
    | "validationErrorCount"
  > = "overallLayoutScore"
): LayoutCandidateSummary[] {
  const ascending = ["averageRackToStationDistance", "p90RackToStationDistance", "congestionRiskScore", "validationErrorCount"].includes(sortKey);
  return [...summaries].sort((a, b) => {
    const delta = Number(a[sortKey]) - Number(b[sortKey]);
    return ascending ? delta : -delta;
  });
}

export function chooseBestProceduralCandidate(params: GenerationParams): WarehouseLayout {
  const candidates = generateProceduralCandidates(params);
  const summaries = sortCandidateSummaries(summarizeCandidates(candidates));
  const ranked = summaries.map((summary) => candidates.find((layout) => layout.layoutId === summary.layoutId)!).filter(Boolean);
  const best = ranked[0];
  return {
    ...best,
    metadata: {
      ...best.metadata,
      selectedFromCandidates: true,
      candidates: ranked.map((layout, index) => ({
        rank: index + 1,
        layoutId: layout.layoutId,
        family: layout.metadata.layoutFamily,
        score: summaries[index]?.overallLayoutScore ?? layout.metadata.candidateScore,
        racks: layout.racks.length,
        stations: layout.stations.length
      }))
    }
  };
}

export function applyHybridFill(base: WarehouseLayout, params: GenerationParams): WarehouseLayout {
  const generated = generateProceduralLayout({ ...params, rows: base.grid.rows, columns: base.grid.columns });
  const lockedCells = new Map(
    base.cells
      .filter((cell) => cell.locked || ["BLOCKED", "HUMAN_ZONE", "DOCK", "ROAD", "QUEUE", "CHARGING", "PARKING", "STATION"].includes(cell.cellType))
      .map((cell) => [cellKey(cell), cell])
  );
  const occupiedByBaseObjects = new Set<string>([
    ...base.racks.flatMap((rack) => rackOccupiedCells(rack, base.grid).map(cellKey)),
    ...base.stations.flatMap((station) => [station.cell, ...stationQueueCells(base, station)].map(cellKey)),
    ...base.chargingSpots.flatMap((charger) => charger.cells.map(cellKey)),
    ...base.parkingSpots.map((parking) => cellKey(parking.cell))
  ]);
  const protectedCells = new Set([...lockedCells.keys(), ...occupiedByBaseObjects]);
  const objectTouchesProtected = (cells: GridCell[]) => cells.some((cell) => protectedCells.has(cellKey(cell)));
  return ensureStorageLocations({
    ...generated,
    layoutId: makeId("hybrid"),
    name: "Hybrid Generated Layout",
    mode: "hybrid",
    cells: [
      ...generated.cells.filter((cell) => !protectedCells.has(cellKey(cell))),
      ...lockedCells.values()
    ],
    racks: [...base.racks, ...generated.racks.filter((rack) => !objectTouchesProtected(rackOccupiedCells(rack, generated.grid)))],
    stations: [...base.stations, ...generated.stations.filter((station) => !objectTouchesProtected([station.cell, ...stationQueueCells(generated, station)]))],
    queueLanes: [...(base.queueLanes ?? []), ...(generated.queueLanes ?? []).filter((lane) => !objectTouchesProtected(lane.cells.map((item) => item.cell)))],
    chargingSpots: [...base.chargingSpots, ...generated.chargingSpots.filter((charger) => !objectTouchesProtected(charger.cells))],
    parkingSpots: [...base.parkingSpots, ...generated.parkingSpots.filter((parking) => !objectTouchesProtected([parking.cell]))],
    rotationZones: [],
    metadata: { ...generated.metadata, hybridGeneratedFromConstraints: true }
  });
}

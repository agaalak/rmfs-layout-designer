import type { CellType, Direction, GridCell, LayoutCell } from "../models/grid";
import { allDirections } from "../models/grid";
import type { GenerationParams, WarehouseLayout } from "../models/layout";
import type { Rack, RackFace } from "../models/rack";
import type { Station, ServiceSide, StationType } from "../models/station";
import { serviceSideOrientation } from "../models/station";
import type { ChargingSpot } from "../models/charging";
import type { ParkingSpot } from "../models/parking";
import type { RotationZone } from "../models/rotation";
import { cellKey, deriveDimensions, inBounds, neighbors, spreadIndices } from "../utils/gridMath";
import { makeId, nextSequentialId } from "../utils/ids";

type CellMap = Map<string, CellType>;

export const defaultGenerationParams: GenerationParams = {
  rows: 40,
  columns: 60,
  cellWidthM: 1.2,
  cellDepthM: 1.2,
  rackFootprintWidthM: 1,
  rackFootprintDepthM: 1,
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
  candidateCount: 8,
  layoutFamily: "traditional_external"
};

export function makeLayoutShell(params: GenerationParams, mode: WarehouseLayout["mode"]): WarehouseLayout {
  const grid = {
    rows: params.rows,
    columns: params.columns,
    cellWidthM: params.cellWidthM,
    cellDepthM: params.cellDepthM
  };
  return {
    layoutId: makeId("layout"),
    name: mode === "manual" ? "Manual RMFS Layout" : "Generated RMFS Layout",
    mode,
    grid,
    physicalDimensions: deriveDimensions(grid),
    cells: [],
    racks: [],
    stations: [],
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
  cell: GridCell,
  side: ServiceSide,
  type: StationType,
  params: GenerationParams
) {
  const queueCells = makeQueue(cell, side, 4, params);
  setCell(cells, cell, "STATION");
  queueCells.forEach((queue) => setCell(cells, queue, "QUEUE"));
  stations.push({
    id: makeId("station"),
    stationId: nextSequentialId(type.toLowerCase(), stations.length),
    stationType: type,
    cell,
    serviceSide: side,
    acceptedRackFaces: ["A", "B"],
    requiredRackOrientationDeg: serviceSideOrientation[side],
    queueCells,
    targetServiceTimeSec: 30,
    maxQueueLength: queueCells.length
  });
}

function addExternalStations(cells: CellMap, stations: Station[], params: GenerationParams) {
  const cols = spreadIndices(params.stationCount, 3, params.columns - 4);
  cols.forEach((col, index) => {
    const side: ServiceSide = index % 2 === 0 ? "SOUTH" : "NORTH";
    addStation(
      cells,
      stations,
      { row: side === "SOUTH" ? params.rows - 1 : 0, col },
      side,
      index < 6 ? "PICK" : "REPLENISH",
      params
    );
  });
}

function addInternalStations(cells: CellMap, stations: Station[], params: GenerationParams, distributed: boolean) {
  const rows = distributed
    ? spreadIndices(params.stationCount, Math.max(4, Math.floor(params.rows / 5)), Math.min(params.rows - 5, Math.floor((params.rows * 4) / 5)))
    : Array.from({ length: params.stationCount }, () => Math.floor(params.rows / 2));
  const cols = spreadIndices(params.stationCount, Math.floor(params.columns / 4), Math.floor((params.columns * 3) / 4));
  cols.forEach((col, index) => {
    const side: ServiceSide = index % 2 === 0 ? "NORTH" : "SOUTH";
    addStation(cells, stations, { row: rows[index] ?? Math.floor(params.rows / 2), col }, side, index < 6 ? "PICK" : "REPLENISH", params);
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
  return Array.from({ length: rows * columns }, (_, index) => {
    const rowIndex = Math.floor(index / columns);
    const columnIndex = index % columns;
    return {
      binId: `${rackId}_${faceId}_${rowIndex + 1}_${columnIndex + 1}`,
      barcode: `${barcodePrefix}-${faceId}-${rowIndex + 1}-${columnIndex + 1}`,
      locationId: `${locationPrefix}.${faceId}.${rowIndex + 1}.${columnIndex + 1}`,
      faceId,
      rowIndex,
      columnIndex,
      widthM,
      depthM,
      heightM
    };
  });
}

function makeFaces(rackId: string): RackFace[] {
  return ["A", "B"].map((faceId) => ({
    faceId: faceId as "A" | "B",
    localSide: faceId === "A" ? "FRONT" : "BACK",
    rows: 4,
    columns: 3,
    bins: makeRackBins(rackId, faceId as "A" | "B", 4, 3)
  }));
}

function addRacks(cells: CellMap, racks: Rack[], params: GenerationParams) {
  const candidates: GridCell[] = [];
  const grid = { rows: params.rows, columns: params.columns, cellWidthM: params.cellWidthM, cellDepthM: params.cellDepthM };
  for (let row = 1; row < params.rows - 1; row += 1) {
    for (let col = 1; col < params.columns - 1; col += 1) {
      const cell = { row, col };
      const key = cellKey(cell);
      if (cells.has(key)) continue;
      if (neighbors(cell, grid).some((neighborCell) => cells.get(cellKey(neighborCell)) === "ROAD" || cells.get(cellKey(neighborCell)) === "QUEUE")) {
        candidates.push(cell);
      }
    }
  }
  const count = Math.max(1, Math.floor(candidates.length * params.rackFillRatio));
  candidates.slice(0, count).forEach((cell, index) => {
    const rackId = nextSequentialId("rack", index);
    const demandClass = index < count * 0.25 ? "HOT" : index < count * 0.65 ? "WARM" : "COLD";
    setCell(cells, cell, "RACK_STORAGE");
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
      faces: makeFaces(rackId),
      storageZoneId: demandClass.toLowerCase(),
      demandClass
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
  return !["STATION", "QUEUE", "CHARGING", "PARKING", "ROTATION", "BLOCKED", "HUMAN_ZONE", "DOCK", "RACK_STORAGE"].includes(
    cells.get(cellKey(cell)) ?? "EMPTY"
  );
}

function pushRotation(cells: CellMap, rotations: RotationZone[], cell: GridCell) {
  setCell(cells, cell, "ROTATION");
  rotations.push({
    id: makeId("rotation"),
    rotationZoneId: nextSequentialId("rotation", rotations.length),
    cells: [cell],
    allowedRackTypes: ["two_face_mobile_rack"],
    supportedOrientationsDeg: [0, 90, 180, 270],
    rotationTimeSec: 6,
    safetyClearanceCells: 1
  });
}

function stationRotationCandidates(station: Station): GridCell[] {
  const [dr, dc] = queueDeltaForSide(station.serviceSide);
  const right: [number, number] = [dc, -dr];
  const left: [number, number] = [-dc, dr];
  const queueEnd = station.queueCells.at(-1) ?? station.cell;
  const firstQueue = station.queueCells[0] ?? station.cell;
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

function addRotationZones(cells: CellMap, rotations: RotationZone[], params: GenerationParams, stations: Station[]) {
  const targetCount = Math.max(params.rotationZoneCount, stations.length * 2);
  for (const station of stations) {
    if (rotations.length >= targetCount) break;
    let addedForStation = 0;
    for (const candidate of stationRotationCandidates(station)) {
      if (addedForStation >= 2 || rotations.length >= targetCount) break;
      if (!isRotationCellAvailable(cells, candidate, params)) continue;
      pushRotation(cells, rotations, candidate);
      addedForStation += 1;
    }
  }

  for (let row = 2; row < params.rows - 2 && rotations.length < targetCount; row += 4) {
    for (let col = 2; col < params.columns - 2 && rotations.length < targetCount; col += 5) {
      const cell = { row, col };
      if (cells.get(cellKey(cell)) !== "ROAD") continue;
      pushRotation(cells, rotations, cell);
    }
  }
}

function materializeCells(cells: CellMap, trafficMode: GenerationParams["trafficMode"]): LayoutCell[] {
  const directions: Direction[] = trafficMode === "two_way" ? allDirections : ["east", "south"];
  return [...cells.entries()].map(([key, cellType]) => {
    const [row, col] = key.split(":").map(Number);
    return { row, col, cellType, allowedDirections: directions };
  });
}

export function generateProceduralLayout(params: GenerationParams): WarehouseLayout {
  const layout = makeLayoutShell(params, "procedural");
  const cells: CellMap = new Map();
  const stations: Station[] = [];
  const racks: Rack[] = [];
  const chargers: ChargingSpot[] = [];
  const parking: ParkingSpot[] = [];
  const rotations: RotationZone[] = [];

  markAisles(cells, params, params.layoutFamily === "dense_with_cross_aisles");
  if (params.layoutFamily === "internal_centralized") addInternalStations(cells, stations, params, false);
  else if (params.layoutFamily === "internal_distributed") addInternalStations(cells, stations, params, true);
  else if (params.layoutFamily === "hybrid_external_internal") {
    addExternalStations(cells, stations, { ...params, stationCount: Math.ceil(params.stationCount / 2) });
    addInternalStations(cells, stations, { ...params, stationCount: Math.floor(params.stationCount / 2) }, true);
  } else addExternalStations(cells, stations, params);

  addChargers(cells, chargers, params);
  addParking(cells, parking, params);
  addRotationZones(cells, rotations, params, stations);
  addRacks(cells, racks, params);

  return {
    ...layout,
    name: "Mode B Generated Layout",
    cells: materializeCells(cells, params.trafficMode),
    racks,
    stations,
    chargingSpots: chargers,
    parkingSpots: parking,
    rotationZones: rotations,
    metadata: { ...layout.metadata, layoutFamily: params.layoutFamily }
  };
}

const candidateFamilies: GenerationParams["layoutFamily"][] = [
  "traditional_external",
  "internal_centralized",
  "internal_distributed",
  "hybrid_external_internal",
  "dense_with_cross_aisles",
  "flying_v_placeholder"
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
      candidateIndex: index + 1,
      candidateScore: quickCandidateScore(candidate),
      generatedCandidateCount: count
    };
    return candidate;
  });
}

export function chooseBestProceduralCandidate(params: GenerationParams): WarehouseLayout {
  const candidates = generateProceduralCandidates(params);
  const ranked = [...candidates].sort((a, b) => Number(b.metadata.candidateScore ?? 0) - Number(a.metadata.candidateScore ?? 0));
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
        score: layout.metadata.candidateScore,
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
    ...base.racks.map((rack) => cellKey(rack.homeCell)),
    ...base.stations.flatMap((station) => [station.cell, ...station.queueCells].map(cellKey)),
    ...base.chargingSpots.flatMap((charger) => charger.cells.map(cellKey)),
    ...base.parkingSpots.map((parking) => cellKey(parking.cell)),
    ...base.rotationZones.flatMap((zone) => zone.cells.map(cellKey))
  ]);
  const protectedCells = new Set([...lockedCells.keys(), ...occupiedByBaseObjects]);
  const objectTouchesProtected = (cells: GridCell[]) => cells.some((cell) => protectedCells.has(cellKey(cell)));
  return {
    ...generated,
    layoutId: makeId("hybrid"),
    name: "Hybrid Generated Layout",
    mode: "hybrid",
    cells: [
      ...generated.cells.filter((cell) => !protectedCells.has(cellKey(cell))),
      ...lockedCells.values()
    ],
    racks: [...base.racks, ...generated.racks.filter((rack) => !objectTouchesProtected([rack.homeCell]))],
    stations: [...base.stations, ...generated.stations.filter((station) => !objectTouchesProtected([station.cell, ...station.queueCells]))],
    chargingSpots: [...base.chargingSpots, ...generated.chargingSpots.filter((charger) => !objectTouchesProtected(charger.cells))],
    parkingSpots: [...base.parkingSpots, ...generated.parkingSpots.filter((parking) => !objectTouchesProtected([parking.cell]))],
    rotationZones: [...base.rotationZones, ...generated.rotationZones.filter((zone) => !objectTouchesProtected(zone.cells))],
    metadata: { ...generated.metadata, hybridGeneratedFromConstraints: true }
  };
}

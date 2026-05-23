import { create } from "zustand";
import type { CellType, Direction, GridCell, LayoutCell } from "../models/grid";
import { allDirections } from "../models/grid";
import type { ChargingSpot } from "../models/charging";
import type { GenerationParams, LayoutCandidateSummary, SelectedObjectRef, WarehouseLayout } from "../models/layout";
import type { ParkingSpot } from "../models/parking";
import type { Rack } from "../models/rack";
import type { ServiceSide, Station } from "../models/station";
import { serviceSideOrientation } from "../models/station";
import {
  applyHybridFill,
  chooseBestProceduralCandidate,
  createEmptyLayout,
  defaultGenerationParams,
  generateLargeDemoLayout,
  generateProceduralLayout,
  generateProceduralCandidates,
  generateSmallDemoLayout,
  largeDemoGenerationParams,
  makeRackBins,
  smallDemoGenerationParams,
  sortCandidateSummaries,
  summarizeCandidates
} from "../generators/proceduralGenerator";
import { cellKey, deriveDimensions, inBounds } from "../utils/gridMath";
import { makeId, nextSequentialId } from "../utils/ids";
import { rackOccupiedCells } from "../utils/rackFootprint";
import { regenerateRackBins as regenerateRackBinsForRack } from "../utils/rackBins";
import { ensureStorageLocations } from "../utils/storageLocations";
import { normalizeLayoutSemantics } from "../utils/layoutSemantics";
import { deriveDirectedLinksFromCells, setOutgoingLinksForCell } from "../utils/directionLinks";
import { stationQueuePointCells } from "../utils/queuePoints";
import { loadDefaultSavedLayout } from "../importExport/layoutPersistence";
import { pushHistory, redoHistory, undoHistory, type HistoryState } from "./historyStore";

type RackPlacementDefaults = Pick<Rack, "footprintWidthM" | "footprintDepthM" | "currentOrientationDeg">;
type RoadCellDefaults = Pick<
  LayoutCell,
  "allowedDirections" | "allowRotation" | "supportedRotationOrientationsDeg" | "rotationTimeSec" | "rotationCapacity" | "allowedRotationRackTypes"
>;

function cloneLayout(layout: WarehouseLayout): WarehouseLayout {
  return structuredClone(layout);
}

function cellMap(layout: WarehouseLayout): Map<string, LayoutCell> {
  return new Map(layout.cells.map((cell) => [cellKey(cell), cell]));
}

function objectCells(layout: WarehouseLayout, objectId?: string): GridCell[] {
  if (!objectId) return [];
  const rack = layout.racks.find((item) => item.id === objectId);
  if (rack) return rackOccupiedCells(rack, layout.grid);
  const station = layout.stations.find((item) => item.id === objectId);
  if (station) return [station.cell, ...stationQueuePointCells(layout, station)];
  const charger = layout.chargingSpots.find((item) => item.id === objectId);
  if (charger) return charger.cells;
  const parking = layout.parkingSpots.find((item) => item.id === objectId);
  if (parking) return [parking.cell];
  return [];
}

export interface CandidateComparisonState {
  baseLayout: WarehouseLayout;
  candidates: WarehouseLayout[];
  summaries: LayoutCandidateSummary[];
  selectedCandidateId: string;
  sortKey: CandidateSortKey;
}

export type CandidateSortKey =
  | "overallLayoutScore"
  | "storageDensity"
  | "averageRackToStationDistance"
  | "p90RackToStationDistance"
  | "congestionRiskScore"
  | "validationErrorCount";

function lockedObjectAtCell(layout: WarehouseLayout, cell: GridCell) {
  const key = cellKey(cell);
  return (
    layout.racks.some((rack) => rack.locked && rackOccupiedCells(rack, layout.grid).some((item) => cellKey(item) === key)) ||
    layout.stations.some((station) => station.locked && [station.cell, ...stationQueuePointCells(layout, station)].some((item) => cellKey(item) === key)) ||
    layout.chargingSpots.some((charger) => charger.locked && charger.cells.some((item) => cellKey(item) === key)) ||
    layout.parkingSpots.some((parking) => parking.locked && cellKey(parking.cell) === key)
  );
}

function upsertCell(layout: WarehouseLayout, cell: GridCell, cellType: CellType, roadDefaults?: RoadCellDefaults): WarehouseLayout {
  if (!inBounds(cell, layout.grid)) return layout;
  const map = cellMap(layout);
  const key = cellKey(cell);
  const existing = map.get(key);
  if (existing?.locked) return layout;
  if (cellType === "EMPTY") {
    map.delete(key);
  } else {
    map.set(key, {
      row: cell.row,
      col: cell.col,
      cellType,
      allowedDirections: existing?.allowedDirections ?? (cellType === "ROAD" ? roadDefaults?.allowedDirections : undefined) ?? allDirections,
      zoneId: existing?.zoneId,
    locked: existing?.locked,
    allowRotation: existing?.allowRotation ?? (cellType === "ROAD" ? roadDefaults?.allowRotation : undefined),
    supportedRotationOrientationsDeg: existing?.supportedRotationOrientationsDeg ?? (cellType === "ROAD" ? roadDefaults?.supportedRotationOrientationsDeg : undefined),
    rotationTimeSec: existing?.rotationTimeSec ?? (cellType === "ROAD" ? roadDefaults?.rotationTimeSec : undefined),
    rotationCapacity: existing?.rotationCapacity ?? (cellType === "ROAD" ? roadDefaults?.rotationCapacity : undefined),
    allowedRotationRackTypes: existing?.allowedRotationRackTypes ?? (cellType === "ROAD" ? roadDefaults?.allowedRotationRackTypes : undefined)
    });
  }
  const cells = [...map.values()];
  return { ...layout, cells, directedLinks: deriveDirectedLinksFromCells({ grid: layout.grid, cells }) };
}

function clearRackCells(layout: WarehouseLayout, rack: Rack): WarehouseLayout {
  let next = layout;
  rackOccupiedCells(rack, layout.grid).forEach((cell) => {
    next = upsertCell(next, cell, "EMPTY");
  });
  return next;
}

function markRackCells(layout: WarehouseLayout, rack: Rack): WarehouseLayout {
  let next = layout;
  rackOccupiedCells(rack, layout.grid).forEach((cell) => {
    next = upsertCell(next, cell, "RACK_STORAGE");
  });
  return next;
}

function removeObjectsAtCell(layout: WarehouseLayout, cell: GridCell): WarehouseLayout {
  const key = cellKey(cell);
  const racksToRemove = layout.racks.filter((rack) => !rack.locked && rackOccupiedCells(rack, layout.grid).some((item) => cellKey(item) === key));
  const stationsToRemove = layout.stations.filter((station) => !station.locked && cellKey(station.cell) === key);
  const chargersToRemove = layout.chargingSpots.filter((charger) => !charger.locked && charger.cells.some((item) => cellKey(item) === key));
  const parkingToRemove = layout.parkingSpots.filter((parking) => !parking.locked && cellKey(parking.cell) === key);
  let next = {
    ...layout,
    racks: layout.racks.filter((rack) => !racksToRemove.some((item) => item.id === rack.id)),
    stations: layout.stations.filter((station) => !stationsToRemove.some((item) => item.id === station.id)),
    chargingSpots: layout.chargingSpots.filter((charger) => !chargersToRemove.some((item) => item.id === charger.id)),
    parkingSpots: layout.parkingSpots.filter((parking) => !parkingToRemove.some((item) => item.id === parking.id)),
    queueLanes: layout.queueLanes.filter((lane) => !stationsToRemove.some((station) => lane.stationId === station.id))
  };
  racksToRemove.flatMap((rack) => rackOccupiedCells(rack, layout.grid)).forEach((item) => {
    next = upsertCell(next, item, "EMPTY");
  });
  stationsToRemove.flatMap((station) => [station.cell, ...stationQueuePointCells(layout, station)]).forEach((item) => {
    next = upsertCell(next, item, "EMPTY");
  });
  chargersToRemove.flatMap((charger) => charger.cells).forEach((item) => {
    next = upsertCell(next, item, "EMPTY");
  });
  parkingToRemove.map((parking) => parking.cell).forEach((item) => {
    next = upsertCell(next, item, "EMPTY");
  });
  return next;
}

const sampleSkus = ["SKU-HOT-001", "SKU-HOT-002", "SKU-WARM-001", "SKU-WARM-002", "SKU-COLD-001", "SKU-COLD-002"];

const initialRackPlacementDefaults: RackPlacementDefaults = {
  footprintWidthM: 1.2,
  footprintDepthM: 1.2,
  currentOrientationDeg: 0
};

const initialRoadCellDefaults: RoadCellDefaults = {
  allowedDirections: allDirections,
  allowRotation: false,
  supportedRotationOrientationsDeg: [0, 90, 180, 270],
  rotationTimeSec: 6,
  rotationCapacity: 1
};

function makeDefaultRack(index: number, homeCell: GridCell, defaults: RackPlacementDefaults = initialRackPlacementDefaults): Rack {
  const rackId = nextSequentialId("rack", index);
  return {
    id: makeId("rack"),
    rackId,
    rackTypeId: "two_face_mobile_rack",
    homeCell,
    footprintWidthM: defaults.footprintWidthM,
    footprintDepthM: defaults.footprintDepthM,
    heightM: 1.8,
    currentOrientationDeg: defaults.currentOrientationDeg,
    allowedOrientationsDeg: [0, 90, 180, 270],
    storageZoneId: "hot",
    demandClass: "HOT",
    operationalStatus: "STORED",
    faces: ["A", "B"].map((faceId) => ({
      faceId: faceId as "A" | "B",
      localSide: faceId === "A" ? "FRONT" : "BACK",
      rows: 4,
      columns: 3,
      bins: makeRackBins(rackId, faceId as "A" | "B", 4, 3).map((bin, binIndex) => ({
        ...bin,
        sku: sampleSkus[(index + binIndex) % sampleSkus.length],
        quantity: 8 + ((index + binIndex) % 7),
        reservedQuantity: 0,
        maxQuantity: 40
      }))
    }))
  };
}

function makeDefaultStation(index: number, cell: GridCell): Station {
  const side: ServiceSide = "SOUTH";
  return {
    id: makeId("station"),
    stationId: nextSequentialId("pick", index),
    stationType: "PICK",
    cell,
    serviceSide: side,
    acceptedRackFaces: ["A", "B"],
    requiredRackOrientationDeg: serviceSideOrientation[side],
    targetServiceTimeSec: 30,
    capacity: 1,
    queuePolicy: {
      requireQueuePointVisit: false,
      queuePointSelectionStrategy: "nearest_feasible",
      sharedQueuePointsAllowed: true,
      stationCapacity: 1
    },
    queueLaneIds: []
  };
}

interface LayoutState {
  history: HistoryState<WarehouseLayout>;
  selected: SelectedObjectRef[];
  selectedCell?: GridCell;
  clipboard: SelectedObjectRef[];
  generationParams: GenerationParams;
  candidateComparison?: CandidateComparisonState;
  rackPlacementDefaults: RackPlacementDefaults;
  roadCellDefaults: RoadCellDefaults;
  setLayout: (layout: WarehouseLayout) => void;
  newLayout: (params?: Partial<GenerationParams>) => void;
  generateModeB: (params: GenerationParams) => void;
  selectCandidatePreview: (candidateId: string) => void;
  sortCandidates: (sortKey: CandidateSortKey) => void;
  applySelectedCandidate: () => void;
  closeCandidateComparison: () => void;
  generateHybrid: (params: GenerationParams) => void;
  loadDemo: () => void;
  loadSmallDemo: () => void;
  loadLargeDemo: () => void;
  populateSampleInventory: () => void;
  clearSampleInventory: () => void;
  selectObject: (ref: SelectedObjectRef, additive?: boolean) => void;
  selectCell: (cell: GridCell) => void;
  clearSelection: () => void;
  setSelection: (refs: SelectedObjectRef[]) => void;
  drawCell: (cell: GridCell, cellType: CellType) => void;
  eraseCell: (cell: GridCell) => void;
  addRack: (cell: GridCell) => void;
  addStation: (cell: GridCell) => void;
  addCharger: (cell: GridCell, size?: 1 | 2) => void;
  addParking: (cell: GridCell) => void;
  addRotation: (cell: GridCell) => void;
  moveObject: (ref: SelectedObjectRef, cell: GridCell) => void;
  deleteSelected: () => void;
  rotateSelected: () => void;
  copySelected: () => void;
  pasteClipboard: () => void;
  updateRack: (id: string, patch: Partial<Rack>) => void;
  updateStation: (id: string, patch: Partial<Station>) => void;
  updateCharger: (id: string, patch: Partial<ChargingSpot>) => void;
  updateParking: (id: string, patch: Partial<ParkingSpot>) => void;
  updateRotation: (id: string, patch: Record<string, unknown>) => void;
  regenerateRackBins: (id: string) => void;
  updateLayoutMeta: (patch: Partial<WarehouseLayout>) => void;
  markSavedBaseline: () => void;
  updateCell: (cell: GridCell, patch: Partial<LayoutCell>) => void;
  setCellDirections: (cell: GridCell, directions: Direction[]) => void;
  toggleSelectedLock: () => void;
  undo: () => void;
  redo: () => void;
}

function withSampleInventory(layout: WarehouseLayout): WarehouseLayout {
  return {
    ...layout,
    racks: layout.racks.map((rack, rackIndex) => ({
      ...rack,
      faces: rack.faces.map((face) => ({
        ...face,
        bins: face.bins.map((bin, binIndex) => ({
          ...bin,
          sku: bin.sku ?? sampleSkus[(rackIndex + binIndex) % sampleSkus.length],
          quantity: bin.quantity && bin.quantity > 0 ? bin.quantity : 8 + ((rackIndex + binIndex) % 7),
          reservedQuantity: 0,
          maxQuantity: bin.maxQuantity ?? 40
        }))
      }))
    })),
    modifiedAt: new Date().toISOString(),
    metadata: { ...layout.metadata, sampleInventoryPopulated: true }
  };
}

function withoutSampleInventory(layout: WarehouseLayout): WarehouseLayout {
  return {
    ...layout,
    racks: layout.racks.map((rack) => ({
      ...rack,
      faces: rack.faces.map((face) => ({
        ...face,
        bins: face.bins.map((bin) => ({ ...bin, sku: undefined, quantity: 0, reservedQuantity: 0 }))
      }))
    })),
    modifiedAt: new Date().toISOString(),
    metadata: { ...layout.metadata, sampleInventoryPopulated: false }
  };
}

const initialLayout = loadDefaultSavedLayout() ?? generateSmallDemoLayout();

function commit(history: HistoryState<WarehouseLayout>, layout: WarehouseLayout) {
  return pushHistory(history, ensureStorageLocations(normalizeLayoutSemantics(cloneLayout(layout))));
}

function refreshDirectedLinks(layout: WarehouseLayout): WarehouseLayout {
  return { ...layout, directedLinks: deriveDirectedLinksFromCells({ grid: layout.grid, cells: layout.cells }) };
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  history: { past: [], present: initialLayout, future: [] },
  selected: [],
  selectedCell: undefined,
  clipboard: [],
  generationParams: defaultGenerationParams,
  candidateComparison: undefined,
  rackPlacementDefaults: initialRackPlacementDefaults,
  roadCellDefaults: initialRoadCellDefaults,
  setLayout: (layout) => set((state) => ({ history: commit(state.history, { ...layout, modifiedAt: new Date().toISOString() }), selected: [], selectedCell: undefined, candidateComparison: undefined })),
  newLayout: (params) =>
    set((state) => ({
      history: commit(state.history, createEmptyLayout({ ...defaultGenerationParams, ...params })),
      selected: [],
      selectedCell: undefined,
      candidateComparison: undefined
    })),
  generateModeB: (params) =>
    set((state) => {
      const candidates = generateProceduralCandidates(params);
      const summaries = sortCandidateSummaries(summarizeCandidates(candidates));
      const selectedCandidateId = summaries[0]?.candidateId ?? String(candidates[0]?.metadata.candidateId ?? candidates[0]?.layoutId);
      const selectedLayout = candidates.find((candidate) => candidate.metadata.candidateId === selectedCandidateId || candidate.layoutId === selectedCandidateId) ?? chooseBestProceduralCandidate(params);
      return {
        generationParams: params,
        candidateComparison: { baseLayout: state.history.present, candidates, summaries, selectedCandidateId, sortKey: "overallLayoutScore" },
        history: commit(state.history, {
          ...selectedLayout,
          metadata: { ...selectedLayout.metadata, candidatePreview: true, candidateSummaries: summaries }
        }),
        selected: [],
        selectedCell: undefined
      };
    }),
  selectCandidatePreview: (candidateId) =>
    set((state) => {
      const comparison = state.candidateComparison;
      if (!comparison) return {};
      const candidate = comparison.candidates.find((layout) => layout.metadata.candidateId === candidateId || layout.layoutId === candidateId);
      if (!candidate) return {};
      return {
        candidateComparison: { ...comparison, selectedCandidateId: candidateId },
        history: commit(state.history, {
          ...candidate,
          metadata: { ...candidate.metadata, candidatePreview: true, candidateSummaries: comparison.summaries }
        }),
        selected: [],
        selectedCell: undefined
      };
    }),
  sortCandidates: (sortKey) =>
    set((state) => {
      const comparison = state.candidateComparison;
      if (!comparison) return {};
      return {
        candidateComparison: {
          ...comparison,
          sortKey,
          summaries: sortCandidateSummaries(comparison.summaries, sortKey)
        }
      };
    }),
  applySelectedCandidate: () =>
    set((state) => {
      const comparison = state.candidateComparison;
      if (!comparison) return {};
      const candidate =
        comparison.candidates.find((layout) => layout.metadata.candidateId === comparison.selectedCandidateId || layout.layoutId === comparison.selectedCandidateId) ??
        state.history.present;
      return {
        candidateComparison: undefined,
        history: commit(state.history, {
          ...candidate,
          modifiedAt: new Date().toISOString(),
          metadata: {
            ...candidate.metadata,
            candidatePreview: false,
            appliedCandidateId: comparison.selectedCandidateId,
            candidateSummaries: comparison.summaries
          }
        }),
        selected: [],
        selectedCell: undefined
      };
    }),
  closeCandidateComparison: () =>
    set((state) => {
      const comparison = state.candidateComparison;
      if (!comparison) return {};
      const isPreview = Boolean(state.history.present.metadata.candidatePreview);
      return {
        candidateComparison: undefined,
        history: isPreview ? commit(state.history, comparison.baseLayout) : state.history
      };
    }),
  generateHybrid: (params) =>
    set((state) => ({
      generationParams: params,
      history: commit(state.history, applyHybridFill(state.history.present, params)),
      selected: [],
      selectedCell: undefined,
      candidateComparison: undefined
    })),
  loadDemo: () =>
    set((state) => ({
      generationParams: smallDemoGenerationParams,
      history: commit(state.history, generateSmallDemoLayout()),
      selected: [],
      selectedCell: undefined,
      candidateComparison: undefined
    })),
  loadSmallDemo: () =>
    set((state) => ({
      generationParams: smallDemoGenerationParams,
      history: commit(state.history, generateSmallDemoLayout()),
      selected: [],
      selectedCell: undefined,
      candidateComparison: undefined
    })),
  loadLargeDemo: () =>
    set((state) => ({
      generationParams: largeDemoGenerationParams,
      history: commit(state.history, generateLargeDemoLayout()),
      selected: [],
      selectedCell: undefined,
      candidateComparison: undefined
    })),
  populateSampleInventory: () =>
    set((state) => ({
      history: commit(state.history, withSampleInventory(state.history.present))
    })),
  clearSampleInventory: () =>
    set((state) => ({
      history: commit(state.history, withoutSampleInventory(state.history.present))
    })),
  selectObject: (ref, additive = false) =>
    set((state) => ({
      selected: additive
        ? state.selected.some((item) => item.id === ref.id)
          ? state.selected.filter((item) => item.id !== ref.id)
          : [...state.selected, ref]
        : [ref],
      selectedCell: undefined
    })),
  selectCell: (selectedCell) => set({ selected: [], selectedCell }),
  clearSelection: () => set({ selected: [], selectedCell: undefined }),
  setSelection: (selected) => set({ selected, selectedCell: undefined }),
  drawCell: (cell, cellType) =>
    set((state) => {
      if (lockedObjectAtCell(state.history.present, cell)) return {};
      const current = removeObjectsAtCell(state.history.present, cell);
      return { history: commit(state.history, upsertCell(current, cell, cellType, state.roadCellDefaults)) };
    }),
  eraseCell: (cell) =>
    set((state) => {
      if (lockedObjectAtCell(state.history.present, cell)) return {};
      const current = removeObjectsAtCell(state.history.present, cell);
      return { history: commit(state.history, upsertCell(current, cell, "EMPTY")), selected: [], selectedCell: undefined };
    }),
  addRack: (cell) =>
    set((state) => {
      if (lockedObjectAtCell(state.history.present, cell)) return {};
      let layout = removeObjectsAtCell(state.history.present, cell);
      const rack = makeDefaultRack(layout.racks.length, cell, state.rackPlacementDefaults);
      layout = markRackCells(layout, rack);
      return {
        history: commit(state.history, { ...layout, racks: [...layout.racks, rack] }),
        selected: [{ kind: "rack", id: rack.id }],
        selectedCell: undefined
      };
    }),
  addStation: (cell) =>
    set((state) => {
      if (lockedObjectAtCell(state.history.present, cell)) return {};
      const layout = upsertCell(removeObjectsAtCell(state.history.present, cell), cell, "STATION");
      const station = makeDefaultStation(layout.stations.length, cell);
      const next = { ...layout, stations: [...layout.stations, station] };
      return { history: commit(state.history, next), selected: [{ kind: "station", id: station.id }], selectedCell: undefined };
    }),
  addCharger: (cell, size = 1) =>
    set((state) => {
      const cells = size === 2 ? [cell, { row: cell.row, col: Math.min(state.history.present.grid.columns - 1, cell.col + 1) }] : [cell];
      if (cells.some((item) => lockedObjectAtCell(state.history.present, item))) return {};
      let layout = state.history.present;
      cells.forEach((chargerCell) => {
        layout = upsertCell(removeObjectsAtCell(layout, chargerCell), chargerCell, "CHARGING");
      });
      const charger: ChargingSpot = {
        id: makeId("charger"),
        chargerId: nextSequentialId("charger", layout.chargingSpots.length),
        cells,
        capacityRobots: size,
        chargerType: "standard"
      };
      return { history: commit(state.history, { ...layout, chargingSpots: [...layout.chargingSpots, charger] }), selected: [{ kind: "charger", id: charger.id }], selectedCell: undefined };
    }),
  addParking: (cell) =>
    set((state) => {
      if (lockedObjectAtCell(state.history.present, cell)) return {};
      const layout = upsertCell(removeObjectsAtCell(state.history.present, cell), cell, "PARKING");
      const parking: ParkingSpot = {
        id: makeId("parking"),
        parkingId: nextSequentialId("parking", layout.parkingSpots.length),
        cell,
        parkingType: "IDLE"
      };
      return { history: commit(state.history, { ...layout, parkingSpots: [...layout.parkingSpots, parking] }), selected: [{ kind: "parking", id: parking.id }], selectedCell: undefined };
    }),
  addRotation: (cell) =>
    set((state) => {
      if (lockedObjectAtCell(state.history.present, cell)) return {};
      const layout = upsertCell(removeObjectsAtCell(state.history.present, cell), cell, "ROAD");
      return {
        history: commit(state.history, {
          ...layout,
          cells: layout.cells.map((item) =>
            cellKey(item) === cellKey(cell)
              ? { ...item, allowRotation: true, supportedRotationOrientationsDeg: [0, 90, 180, 270], rotationTimeSec: 6, rotationCapacity: 1 }
              : item
          )
        }),
        selected: [],
        selectedCell: cell
      };
    }),
  moveObject: (ref, cell) =>
    set((state) => {
      let layout = state.history.present;
      if (!inBounds(cell, layout.grid)) return {};
      if (ref.kind === "rack") {
        const rack = layout.racks.find((item) => item.id === ref.id);
        if (rack?.locked) return {};
        if (rack) {
          const movedRack = { ...rack, homeCell: cell };
          layout = markRackCells(clearRackCells(layout, rack), movedRack);
          layout = { ...layout, racks: layout.racks.map((item) => (item.id === ref.id ? movedRack : item)) };
        }
      }
      if (ref.kind === "station") {
        const station = layout.stations.find((item) => item.id === ref.id);
        if (station?.locked) return {};
        if (station) layout = upsertCell(upsertCell(layout, station.cell, "EMPTY"), cell, "STATION");
        layout = { ...layout, stations: layout.stations.map((item) => (item.id === ref.id ? { ...item, cell } : item)) };
      }
      if (ref.kind === "charger") {
        const charger = layout.chargingSpots.find((item) => item.id === ref.id);
        if (charger?.locked) return {};
        if (charger) {
          charger.cells.forEach((oldCell) => {
            layout = upsertCell(layout, oldCell, "EMPTY");
          });
          const cells = charger.cells.map((oldCell) => ({ row: cell.row + (oldCell.row - charger.cells[0].row), col: cell.col + (oldCell.col - charger.cells[0].col) }));
          cells.forEach((newCell) => {
            layout = upsertCell(layout, newCell, "CHARGING");
          });
          layout = { ...layout, chargingSpots: layout.chargingSpots.map((item) => (item.id === ref.id ? { ...item, cells } : item)) };
        }
      }
      if (ref.kind === "parking") {
        const parking = layout.parkingSpots.find((item) => item.id === ref.id);
        if (parking?.locked) return {};
        if (parking) layout = upsertCell(upsertCell(layout, parking.cell, "EMPTY"), cell, "PARKING");
        layout = { ...layout, parkingSpots: layout.parkingSpots.map((item) => (item.id === ref.id ? { ...item, cell } : item)) };
      }
      return { history: commit(state.history, layout) };
    }),
  deleteSelected: () =>
    set((state) => {
      let layout = state.history.present;
      for (const ref of state.selected) {
        if (ref.kind === "rack") {
          const rack = layout.racks.find((item) => item.id === ref.id);
          if (rack?.locked) continue;
          if (rack) layout = clearRackCells(layout, rack);
          layout = { ...layout, racks: layout.racks.filter((item) => item.id !== ref.id) };
        }
        if (ref.kind === "station") {
          const station = layout.stations.find((item) => item.id === ref.id);
          if (station?.locked) continue;
          if (station) layout = upsertCell(layout, station.cell, "EMPTY");
          layout = {
            ...layout,
            stations: layout.stations.filter((item) => item.id !== ref.id),
            queuePoints: (layout.queuePoints ?? []).filter((point) => !point.stationIds.includes(ref.id)),
            queueLanes: []
          };
        }
        if (ref.kind === "charger") {
          const charger = layout.chargingSpots.find((item) => item.id === ref.id);
          if (charger?.locked) continue;
          charger?.cells.forEach((cell) => {
            layout = upsertCell(layout, cell, "EMPTY");
          });
          layout = { ...layout, chargingSpots: layout.chargingSpots.filter((item) => item.id !== ref.id) };
        }
        if (ref.kind === "parking") {
          const parking = layout.parkingSpots.find((item) => item.id === ref.id);
          if (parking?.locked) continue;
          if (parking) layout = upsertCell(layout, parking.cell, "EMPTY");
          layout = { ...layout, parkingSpots: layout.parkingSpots.filter((item) => item.id !== ref.id) };
        }
      }
      return { history: commit(state.history, layout), selected: [], selectedCell: undefined };
    }),
  rotateSelected: () =>
    set((state) => {
      let layout = state.history.present;
      for (const ref of state.selected) {
        if (ref.kind === "rack") {
          const current = layout.racks.find((rack) => rack.id === ref.id);
          if (current && !current.locked) layout = clearRackCells(layout, current);
          layout = {
            ...layout,
            racks: layout.racks.map((rack) =>
              rack.id === ref.id && !rack.locked
                ? { ...rack, currentOrientationDeg: (((rack.currentOrientationDeg + 90) % 360) as 0 | 90 | 180 | 270) }
                : rack
            )
          };
          const rotated = layout.racks.find((rack) => rack.id === ref.id);
          if (rotated && !rotated.locked) layout = markRackCells(layout, rotated);
        }
        if (ref.kind === "station") {
          const sideOrder: ServiceSide[] = ["NORTH", "EAST", "SOUTH", "WEST"];
          layout = {
            ...layout,
            stations: layout.stations.map((station) => {
              if (station.id !== ref.id) return station;
              if (station.locked) return station;
              const nextSide = sideOrder[(sideOrder.indexOf(station.serviceSide) + 1) % sideOrder.length];
              return { ...station, serviceSide: nextSide, requiredRackOrientationDeg: serviceSideOrientation[nextSide] };
            })
          };
        }
      }
      const rotatedRack = layout.racks.find((rack) => state.selected.some((ref) => ref.kind === "rack" && ref.id === rack.id));
      return {
        history: commit(state.history, layout),
        rackPlacementDefaults: rotatedRack
          ? {
              footprintWidthM: rotatedRack.footprintWidthM,
              footprintDepthM: rotatedRack.footprintDepthM,
              currentOrientationDeg: rotatedRack.currentOrientationDeg
            }
          : state.rackPlacementDefaults
      };
    }),
  copySelected: () => set((state) => ({ clipboard: state.selected })),
  pasteClipboard: () =>
    set((state) => {
      let layout = state.history.present;
      const newSelection: SelectedObjectRef[] = [];
      for (const ref of state.clipboard) {
        if (ref.kind === "rack") {
          const rack = layout.racks.find((item) => item.id === ref.id);
          if (rack) {
            const copy = { ...structuredClone(rack), id: makeId("rack"), rackId: `${rack.rackId}_copy`, homeCell: { row: Math.min(layout.grid.rows - 1, rack.homeCell.row + 1), col: Math.min(layout.grid.columns - 1, rack.homeCell.col + 1) } };
            layout = markRackCells(layout, copy);
            layout = { ...layout, racks: [...layout.racks, copy] };
            newSelection.push({ kind: "rack", id: copy.id });
          }
        }
      }
      return { history: commit(state.history, layout), selected: newSelection, selectedCell: undefined };
    }),
  updateRack: (id, patch) =>
    set((state) => {
      const current = state.history.present.racks.find((rack) => rack.id === id);
      if (!current) return {};
      const nextRack = { ...current, ...patch };
      const footprintChanged =
        Boolean(patch.homeCell) ||
        patch.footprintWidthM !== undefined ||
        patch.footprintDepthM !== undefined ||
        patch.currentOrientationDeg !== undefined;
      let layout = state.history.present;
      if (footprintChanged) layout = clearRackCells(layout, current);
      layout = {
        ...layout,
        racks: layout.racks.map((rack) => (rack.id === id ? nextRack : rack))
      };
      if (footprintChanged) layout = markRackCells(layout, nextRack);
      const nextRackDefaults =
        footprintChanged || patch.footprintWidthM !== undefined || patch.footprintDepthM !== undefined || patch.currentOrientationDeg !== undefined
          ? {
              footprintWidthM: nextRack.footprintWidthM,
              footprintDepthM: nextRack.footprintDepthM,
              currentOrientationDeg: nextRack.currentOrientationDeg
            }
          : state.rackPlacementDefaults;
      return { history: commit(state.history, layout), rackPlacementDefaults: nextRackDefaults };
    }),
  updateStation: (id, patch) =>
    set((state) => {
      let layout = state.history.present;
      const previous = layout.stations.find((station) => station.id === id);
      if (previous && patch.cell) {
        layout = upsertCell(upsertCell(layout, previous.cell, "EMPTY"), patch.cell, "STATION");
      }
      return {
        history: commit(state.history, {
          ...layout,
          stations: layout.stations.map((station) => (station.id === id ? { ...station, ...patch } : station))
        })
      };
    }),
  updateCharger: (id, patch) =>
    set((state) => {
      let layout = state.history.present;
      const previous = layout.chargingSpots.find((charger) => charger.id === id);
      if (previous && patch.cells) {
        previous.cells.forEach((cell) => {
          layout = upsertCell(layout, cell, "EMPTY");
        });
        patch.cells.forEach((cell) => {
          layout = upsertCell(layout, cell, "CHARGING");
        });
      }
      return {
        history: commit(state.history, {
          ...layout,
          chargingSpots: layout.chargingSpots.map((charger) => (charger.id === id ? { ...charger, ...patch } : charger))
        })
      };
    }),
  updateParking: (id, patch) => set((state) => ({ history: commit(state.history, { ...state.history.present, parkingSpots: state.history.present.parkingSpots.map((parking) => (parking.id === id ? { ...parking, ...patch } : parking)) }) })),
  updateRotation: (id, patch) =>
    set((state) => ({ history: commit(state.history, state.history.present), selectedCell: state.selectedCell })),
  regenerateRackBins: (id) =>
    set((state) => ({
      history: commit(state.history, {
        ...state.history.present,
        racks: state.history.present.racks.map((rack) => (rack.id === id ? regenerateRackBinsForRack(rack) : rack))
      })
    })),
  updateLayoutMeta: (patch) =>
    set((state) => {
      const next = { ...state.history.present, ...patch };
      if (patch.grid) next.physicalDimensions = deriveDimensions(patch.grid);
      return { history: commit(state.history, next) };
    }),
  markSavedBaseline: () =>
    set((state) => ({
      history: { past: [], present: { ...state.history.present, modifiedAt: new Date().toISOString() }, future: [] }
    })),
  updateCell: (cell, patch) =>
    set((state) => {
      const key = cellKey(cell);
      const map = cellMap(state.history.present);
      const existing = map.get(key) ?? {
        row: cell.row,
        col: cell.col,
        cellType: "ROAD" as CellType,
        allowedDirections: allDirections
      };
      if (existing.locked && patch.locked !== false) return {};
      if (patch.cellType === "EMPTY") {
        map.delete(key);
      } else {
        map.set(key, { ...existing, ...patch, row: cell.row, col: cell.col });
      }
      const nextCell = patch.cellType === "EMPTY" ? undefined : map.get(key);
      const nextRoadDefaults =
        nextCell && nextCell.cellType === "ROAD"
          ? {
              allowedDirections: nextCell.allowedDirections ?? state.roadCellDefaults.allowedDirections,
              allowRotation: nextCell.allowRotation ?? false,
              supportedRotationOrientationsDeg: nextCell.supportedRotationOrientationsDeg ?? state.roadCellDefaults.supportedRotationOrientationsDeg,
              rotationTimeSec: nextCell.rotationTimeSec ?? state.roadCellDefaults.rotationTimeSec,
              rotationCapacity: nextCell.rotationCapacity ?? state.roadCellDefaults.rotationCapacity,
              allowedRotationRackTypes: nextCell.allowedRotationRackTypes
            }
          : state.roadCellDefaults;
      return {
        history: commit(state.history, refreshDirectedLinks({ ...state.history.present, cells: [...map.values()] })),
        selectedCell: cell,
        roadCellDefaults: nextRoadDefaults
      };
    }),
  setCellDirections: (cell, directions) =>
    set((state) => {
      const key = cellKey(cell);
      const map = cellMap(state.history.present);
      const existing = map.get(key);
      if (existing?.locked) return {};
      const nextCell = {
        row: cell.row,
        col: cell.col,
        cellType: existing?.cellType ?? "ROAD",
        allowedDirections: directions,
        zoneId: existing?.zoneId,
        locked: existing?.locked,
        allowRotation: existing?.allowRotation,
        supportedRotationOrientationsDeg: existing?.supportedRotationOrientationsDeg,
        rotationTimeSec: existing?.rotationTimeSec,
        rotationCapacity: existing?.rotationCapacity,
        allowedRotationRackTypes: existing?.allowedRotationRackTypes
      };
      map.set(key, nextCell);
      const nextLayout = { ...state.history.present, cells: [...map.values()] };
      return {
        history: commit(state.history, {
          ...nextLayout,
          directedLinks: setOutgoingLinksForCell(nextLayout.directedLinks ?? [], cell, directions, nextLayout.cells, nextLayout.grid)
        }),
        selectedCell: cell,
        roadCellDefaults: nextCell.cellType === "ROAD"
          ? {
              allowedDirections: directions,
              allowRotation: nextCell.allowRotation ?? false,
              supportedRotationOrientationsDeg: nextCell.supportedRotationOrientationsDeg ?? state.roadCellDefaults.supportedRotationOrientationsDeg,
              rotationTimeSec: nextCell.rotationTimeSec ?? state.roadCellDefaults.rotationTimeSec,
              rotationCapacity: nextCell.rotationCapacity ?? state.roadCellDefaults.rotationCapacity,
              allowedRotationRackTypes: nextCell.allowedRotationRackTypes
            }
          : state.roadCellDefaults
      };
    }),
  toggleSelectedLock: () =>
    set((state) => {
      const first = state.selected[0];
      const selectedCell = state.selectedCell;
      let layout = state.history.present;
      if (first?.kind === "rack") layout = { ...layout, racks: layout.racks.map((rack) => (rack.id === first.id ? { ...rack, locked: !rack.locked } : rack)) };
      if (first?.kind === "station") layout = { ...layout, stations: layout.stations.map((station) => (station.id === first.id ? { ...station, locked: !station.locked } : station)) };
      if (first?.kind === "charger") layout = { ...layout, chargingSpots: layout.chargingSpots.map((charger) => (charger.id === first.id ? { ...charger, locked: !charger.locked } : charger)) };
      if (first?.kind === "parking") layout = { ...layout, parkingSpots: layout.parkingSpots.map((parking) => (parking.id === first.id ? { ...parking, locked: !parking.locked } : parking)) };
      if (selectedCell && !first) {
        const key = cellKey(selectedCell);
        const map = cellMap(layout);
        const existing = map.get(key) ?? {
          row: selectedCell.row,
          col: selectedCell.col,
          cellType: "ROAD" as CellType,
          allowedDirections: allDirections
        };
        map.set(key, { ...existing, locked: !existing.locked });
        layout = { ...layout, cells: [...map.values()] };
      }
      return { history: commit(state.history, layout) };
    }),
  undo: () => set((state) => ({ history: undoHistory(state.history), selected: [], selectedCell: undefined })),
  redo: () => set((state) => ({ history: redoHistory(state.history), selected: [], selectedCell: undefined }))
}));

export function useCurrentLayout(): WarehouseLayout {
  return useLayoutStore((state) => state.history.present);
}

export function selectedObject(layout: WarehouseLayout, selected: SelectedObjectRef[]) {
  const first = selected[0];
  if (!first) return undefined;
  if (first.kind === "rack") return layout.racks.find((item) => item.id === first.id);
  if (first.kind === "station") return layout.stations.find((item) => item.id === first.id);
  if (first.kind === "charger") return layout.chargingSpots.find((item) => item.id === first.id);
  if (first.kind === "parking") return layout.parkingSpots.find((item) => item.id === first.id);
  return undefined;
}

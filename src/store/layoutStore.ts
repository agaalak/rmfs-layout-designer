import { create } from "zustand";
import type { CellType, Direction, GridCell, LayoutCell } from "../models/grid";
import { allDirections } from "../models/grid";
import type { ChargingSpot } from "../models/charging";
import type { GenerationParams, SelectedObjectRef, WarehouseLayout } from "../models/layout";
import type { ParkingSpot } from "../models/parking";
import type { Rack } from "../models/rack";
import type { RotationZone } from "../models/rotation";
import type { ServiceSide, Station } from "../models/station";
import { serviceSideOrientation } from "../models/station";
import {
  applyHybridFill,
  chooseBestProceduralCandidate,
  createEmptyLayout,
  defaultGenerationParams,
  generateProceduralLayout,
  makeRackBins
} from "../generators/proceduralGenerator";
import { cellKey, deriveDimensions, inBounds } from "../utils/gridMath";
import { makeId, nextSequentialId } from "../utils/ids";
import { pushHistory, redoHistory, undoHistory, type HistoryState } from "./historyStore";

function cloneLayout(layout: WarehouseLayout): WarehouseLayout {
  return structuredClone(layout);
}

function cellMap(layout: WarehouseLayout): Map<string, LayoutCell> {
  return new Map(layout.cells.map((cell) => [cellKey(cell), cell]));
}

function objectCells(layout: WarehouseLayout, objectId?: string): GridCell[] {
  if (!objectId) return [];
  const rack = layout.racks.find((item) => item.id === objectId);
  if (rack) return [rack.homeCell];
  const station = layout.stations.find((item) => item.id === objectId);
  if (station) return [station.cell, ...station.queueCells];
  const charger = layout.chargingSpots.find((item) => item.id === objectId);
  if (charger) return charger.cells;
  const parking = layout.parkingSpots.find((item) => item.id === objectId);
  if (parking) return [parking.cell];
  const zone = layout.rotationZones.find((item) => item.id === objectId);
  return zone?.cells ?? [];
}

function lockedObjectAtCell(layout: WarehouseLayout, cell: GridCell) {
  const key = cellKey(cell);
  return (
    layout.racks.some((rack) => rack.locked && cellKey(rack.homeCell) === key) ||
    layout.stations.some((station) => station.locked && [station.cell, ...station.queueCells].some((item) => cellKey(item) === key)) ||
    layout.chargingSpots.some((charger) => charger.locked && charger.cells.some((item) => cellKey(item) === key)) ||
    layout.parkingSpots.some((parking) => parking.locked && cellKey(parking.cell) === key) ||
    layout.rotationZones.some((zone) => zone.locked && zone.cells.some((item) => cellKey(item) === key))
  );
}

function upsertCell(layout: WarehouseLayout, cell: GridCell, cellType: CellType): WarehouseLayout {
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
      allowedDirections: existing?.allowedDirections ?? allDirections,
      zoneId: existing?.zoneId,
      locked: existing?.locked
    });
  }
  return { ...layout, cells: [...map.values()] };
}

function removeObjectsAtCell(layout: WarehouseLayout, cell: GridCell): WarehouseLayout {
  const key = cellKey(cell);
  return {
    ...layout,
    racks: layout.racks.filter((rack) => rack.locked || cellKey(rack.homeCell) !== key),
    stations: layout.stations.filter((station) => station.locked || cellKey(station.cell) !== key),
    chargingSpots: layout.chargingSpots.filter((charger) => charger.locked || !charger.cells.some((item) => cellKey(item) === key)),
    parkingSpots: layout.parkingSpots.filter((parking) => parking.locked || cellKey(parking.cell) !== key),
    rotationZones: layout.rotationZones.filter((zone) => zone.locked || !zone.cells.some((item) => cellKey(item) === key))
  };
}

function makeDefaultRack(index: number, homeCell: GridCell): Rack {
  const rackId = nextSequentialId("rack", index);
  return {
    id: makeId("rack"),
    rackId,
    rackTypeId: "two_face_mobile_rack",
    homeCell,
    footprintWidthM: 1,
    footprintDepthM: 1,
    heightM: 1.8,
    currentOrientationDeg: 0,
    allowedOrientationsDeg: [0, 90, 180, 270],
    storageZoneId: "hot",
    demandClass: "HOT",
    faces: ["A", "B"].map((faceId) => ({
      faceId: faceId as "A" | "B",
      localSide: faceId === "A" ? "FRONT" : "BACK",
      rows: 4,
      columns: 3,
      bins: makeRackBins(rackId, faceId as "A" | "B", 4, 3)
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
    queueCells: [{ row: Math.max(0, cell.row - 1), col: cell.col }],
    targetServiceTimeSec: 30,
    maxQueueLength: 1
  };
}

interface LayoutState {
  history: HistoryState<WarehouseLayout>;
  selected: SelectedObjectRef[];
  selectedCell?: GridCell;
  clipboard: SelectedObjectRef[];
  generationParams: GenerationParams;
  setLayout: (layout: WarehouseLayout) => void;
  newLayout: (params?: Partial<GenerationParams>) => void;
  generateModeB: (params: GenerationParams) => void;
  generateHybrid: (params: GenerationParams) => void;
  loadDemo: () => void;
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
  updateRotation: (id: string, patch: Partial<RotationZone>) => void;
  updateLayoutMeta: (patch: Partial<WarehouseLayout>) => void;
  updateCell: (cell: GridCell, patch: Partial<LayoutCell>) => void;
  setCellDirections: (cell: GridCell, directions: Direction[]) => void;
  toggleSelectedLock: () => void;
  undo: () => void;
  redo: () => void;
}

const initialLayout = generateProceduralLayout(defaultGenerationParams);

function commit(history: HistoryState<WarehouseLayout>, layout: WarehouseLayout) {
  return pushHistory(history, cloneLayout(layout));
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  history: { past: [], present: initialLayout, future: [] },
  selected: [],
  selectedCell: undefined,
  clipboard: [],
  generationParams: defaultGenerationParams,
  setLayout: (layout) => set((state) => ({ history: commit(state.history, layout), selected: [], selectedCell: undefined })),
  newLayout: (params) =>
    set((state) => ({
      history: commit(state.history, createEmptyLayout({ ...defaultGenerationParams, ...params })),
      selected: [],
      selectedCell: undefined
    })),
  generateModeB: (params) =>
    set((state) => ({
      generationParams: params,
      history: commit(state.history, chooseBestProceduralCandidate(params)),
      selected: [],
      selectedCell: undefined
    })),
  generateHybrid: (params) =>
    set((state) => ({
      generationParams: params,
      history: commit(state.history, applyHybridFill(state.history.present, params)),
      selected: [],
      selectedCell: undefined
    })),
  loadDemo: () =>
    set((state) => ({
      generationParams: defaultGenerationParams,
      history: commit(state.history, generateProceduralLayout(defaultGenerationParams)),
      selected: [],
      selectedCell: undefined
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
      return { history: commit(state.history, upsertCell(current, cell, cellType)) };
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
      const layout = upsertCell(removeObjectsAtCell(state.history.present, cell), cell, "RACK_STORAGE");
      const rack = makeDefaultRack(layout.racks.length, cell);
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
      let next = { ...layout, stations: [...layout.stations, station] };
      station.queueCells.forEach((queue) => {
        next = upsertCell(next, queue, "QUEUE");
      });
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
      const layout = upsertCell(removeObjectsAtCell(state.history.present, cell), cell, "ROTATION");
      const rotation: RotationZone = {
        id: makeId("rotation"),
        rotationZoneId: nextSequentialId("rotation", layout.rotationZones.length),
        cells: [cell],
        allowedRackTypes: ["two_face_mobile_rack"],
        supportedOrientationsDeg: [0, 90, 180, 270],
        rotationTimeSec: 6,
        safetyClearanceCells: 1
      };
      return { history: commit(state.history, { ...layout, rotationZones: [...layout.rotationZones, rotation] }), selected: [{ kind: "rotation", id: rotation.id }], selectedCell: undefined };
    }),
  moveObject: (ref, cell) =>
    set((state) => {
      let layout = state.history.present;
      if (!inBounds(cell, layout.grid)) return {};
      if (ref.kind === "rack") {
        const rack = layout.racks.find((item) => item.id === ref.id);
        if (rack?.locked) return {};
        if (rack) layout = upsertCell(upsertCell(layout, rack.homeCell, "EMPTY"), cell, "RACK_STORAGE");
        layout = { ...layout, racks: layout.racks.map((item) => (item.id === ref.id ? { ...item, homeCell: cell } : item)) };
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
      if (ref.kind === "rotation") {
        const zone = layout.rotationZones.find((item) => item.id === ref.id);
        if (zone?.locked) return {};
        if (zone) layout = upsertCell(upsertCell(layout, zone.cells[0], "EMPTY"), cell, "ROTATION");
        layout = { ...layout, rotationZones: layout.rotationZones.map((item) => (item.id === ref.id ? { ...item, cells: [cell] } : item)) };
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
          if (rack) layout = upsertCell(layout, rack.homeCell, "EMPTY");
          layout = { ...layout, racks: layout.racks.filter((item) => item.id !== ref.id) };
        }
        if (ref.kind === "station") {
          const station = layout.stations.find((item) => item.id === ref.id);
          if (station?.locked) continue;
          if (station) {
            layout = upsertCell(layout, station.cell, "EMPTY");
            station.queueCells.forEach((cell) => {
              layout = upsertCell(layout, cell, "EMPTY");
            });
          }
          layout = { ...layout, stations: layout.stations.filter((item) => item.id !== ref.id) };
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
        if (ref.kind === "rotation") {
          const zone = layout.rotationZones.find((item) => item.id === ref.id);
          if (zone?.locked) continue;
          zone?.cells.forEach((cell) => {
            layout = upsertCell(layout, cell, "EMPTY");
          });
          layout = { ...layout, rotationZones: layout.rotationZones.filter((item) => item.id !== ref.id) };
        }
      }
      return { history: commit(state.history, layout), selected: [], selectedCell: undefined };
    }),
  rotateSelected: () =>
    set((state) => {
      let layout = state.history.present;
      for (const ref of state.selected) {
        if (ref.kind === "rack") {
          layout = {
            ...layout,
            racks: layout.racks.map((rack) =>
              rack.id === ref.id && !rack.locked
                ? { ...rack, currentOrientationDeg: (((rack.currentOrientationDeg + 90) % 360) as 0 | 90 | 180 | 270) }
                : rack
            )
          };
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
      return { history: commit(state.history, layout) };
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
            layout = upsertCell(layout, copy.homeCell, "RACK_STORAGE");
            layout = { ...layout, racks: [...layout.racks, copy] };
            newSelection.push({ kind: "rack", id: copy.id });
          }
        }
      }
      return { history: commit(state.history, layout), selected: newSelection, selectedCell: undefined };
    }),
  updateRack: (id, patch) => set((state) => ({ history: commit(state.history, { ...state.history.present, racks: state.history.present.racks.map((rack) => (rack.id === id ? { ...rack, ...patch } : rack)) }) })),
  updateStation: (id, patch) =>
    set((state) => {
      let layout = state.history.present;
      const previous = layout.stations.find((station) => station.id === id);
      if (previous && patch.queueCells) {
        previous.queueCells.forEach((cell) => {
          layout = upsertCell(layout, cell, "EMPTY");
        });
        patch.queueCells.forEach((cell) => {
          layout = upsertCell(layout, cell, "QUEUE");
        });
      }
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
    set((state) => {
      let layout = state.history.present;
      const previous = layout.rotationZones.find((zone) => zone.id === id);
      if (previous && patch.cells) {
        previous.cells.forEach((cell) => {
          layout = upsertCell(layout, cell, "EMPTY");
        });
        patch.cells.forEach((cell) => {
          layout = upsertCell(layout, cell, "ROTATION");
        });
      }
      return {
        history: commit(state.history, {
          ...layout,
          rotationZones: layout.rotationZones.map((zone) => (zone.id === id ? { ...zone, ...patch } : zone))
        })
      };
    }),
  updateLayoutMeta: (patch) =>
    set((state) => {
      const next = { ...state.history.present, ...patch };
      if (patch.grid) next.physicalDimensions = deriveDimensions(patch.grid);
      return { history: commit(state.history, next) };
    }),
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
      return {
        history: commit(state.history, { ...state.history.present, cells: [...map.values()] }),
        selectedCell: cell
      };
    }),
  setCellDirections: (cell, directions) =>
    set((state) => {
      const key = cellKey(cell);
      const map = cellMap(state.history.present);
      const existing = map.get(key);
      if (existing?.locked) return {};
      map.set(key, {
        row: cell.row,
        col: cell.col,
        cellType: existing?.cellType ?? "ROAD",
        allowedDirections: directions,
        zoneId: existing?.zoneId,
        locked: existing?.locked
      });
      return {
        history: commit(state.history, { ...state.history.present, cells: [...map.values()] }),
        selectedCell: cell
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
      if (first?.kind === "rotation") layout = { ...layout, rotationZones: layout.rotationZones.map((zone) => (zone.id === first.id ? { ...zone, locked: !zone.locked } : zone)) };
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
  return layout.rotationZones.find((item) => item.id === first.id);
}

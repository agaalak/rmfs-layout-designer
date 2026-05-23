import type { WarehouseLayout } from "../models/layout";
import { allDirections, type Direction } from "../models/grid";
import { deriveDirectedLinksFromCells } from "../utils/directionLinks";
import { cellKey } from "../utils/gridMath";
import { neighbor } from "../utils/gridMath";
import { ensureStorageLocations } from "../utils/storageLocations";
import {
  buildRoadGraph,
  chargerNodes,
  stationNodes
} from "./graphBuilder";
import { reachableFrom, reverseGraph } from "./shortestPath";

export interface ConnectivityResult {
  reachableRacks: Set<string>;
  unreachableRacks: Set<string>;
  unreachableStations: Set<string>;
  unreachableChargers: Set<string>;
  unreachableParking: Set<string>;
  unreachableRotationZones: Set<string>;
  reachableNodes: Set<string>;
}

function layoutWithStorageServiceCells(layout: WarehouseLayout): WarehouseLayout {
  const cellMap = new Map(layout.cells.map((cell) => [cellKey(cell), cell]));
  for (const storage of layout.storageLocations) {
    const serviceCell = storage.podServiceCell;
    const key = cellKey(serviceCell);
    const existing = cellMap.get(key);
    const allowedDirections = allDirections.filter((direction): direction is Direction => {
      const target = neighbor(serviceCell, direction);
      const targetCell = cellMap.get(cellKey(target));
      return Boolean(targetCell && targetCell.cellType !== "RACK_STORAGE" && targetCell.cellType !== "BLOCKED" && targetCell.cellType !== "HUMAN_ZONE" && targetCell.cellType !== "DOCK");
    });
    cellMap.set(key, {
      row: serviceCell.row,
      col: serviceCell.col,
      cellType: "ROAD",
      allowedDirections: allowedDirections.length > 0 ? allowedDirections : existing?.allowedDirections ?? allDirections,
      allowRotation: existing?.allowRotation,
      supportedRotationOrientationsDeg: existing?.supportedRotationOrientationsDeg,
      rotationTimeSec: existing?.rotationTimeSec,
      rotationCapacity: existing?.rotationCapacity,
      allowedRotationRackTypes: existing?.allowedRotationRackTypes,
      locked: existing?.locked,
      zoneId: existing?.zoneId
    });
  }
  const cells = [...cellMap.values()];
  return { ...layout, cells, directedLinks: deriveDirectedLinksFromCells({ grid: layout.grid, cells }) };
}

export function validateConnectivity(layout: WarehouseLayout): ConnectivityResult {
  const normalized = ensureStorageLocations(layout);
  const graphLayout = layoutWithStorageServiceCells(normalized);
  const graph = buildRoadGraph(graphLayout);
  const stationSources = normalized.stations.flatMap((station) => stationNodes(station, graph));
  const reachableFromStations = reachableFrom(graph, stationSources);
  const canReachStations = reachableFrom(reverseGraph(graph), stationSources);

  const unreachableRacks = new Set<string>();
  const reachableRacks = new Set<string>();
  for (const rack of normalized.racks) {
    const storage = normalized.storageLocations.find((location) =>
      location.storageLocationId === rack.currentStorageLocationId ||
      location.storageLocationId === rack.homeStorageLocationId ||
      location.cells.some((cell) => cellKey(cell) === cellKey(rack.homeCell))
    );
    const serviceCell = storage?.podServiceCell ?? rack.homeCell;
    const serviceNode = cellKey(serviceCell);
    if (!graph.nodes.has(serviceNode) || !canReachStations.has(serviceNode)) {
      unreachableRacks.add(rack.id);
    } else {
      reachableRacks.add(rack.id);
    }
  }

  const unreachableStations = new Set<string>();
  for (const station of normalized.stations) {
    const nodes = stationNodes(station, graph);
    if (nodes.length === 0 || !nodes.some((node) => reachableFromStations.has(node))) {
      unreachableStations.add(station.id);
    }
  }

  const unreachableChargers = new Set<string>();
  for (const charger of normalized.chargingSpots) {
    const nodes = chargerNodes(charger, graph);
    if (nodes.length === 0 || !nodes.some((node) => canReachStations.has(node))) {
      unreachableChargers.add(charger.id);
    }
  }

  const unreachableParking = new Set<string>();
  for (const parking of normalized.parkingSpots) {
    const node = cellKey(parking.cell);
    if (!graph.nodes.has(node) || !canReachStations.has(node)) {
      unreachableParking.add(parking.id);
    }
  }

  const unreachableRotationZones = new Set<string>();
  for (const cell of normalized.cells.filter((item) => item.allowRotation)) {
    const node = cellKey(cell);
    if (!graph.nodes.has(node) || !canReachStations.has(node)) {
      unreachableRotationZones.add(`rotation_cell_${node}`);
    }
  }

  return {
    reachableRacks,
    unreachableRacks,
    unreachableStations,
    unreachableChargers,
    unreachableParking,
    unreachableRotationZones,
    reachableNodes: reachableFromStations
  };
}

import type { WarehouseLayout } from "../models/layout";
import { cellKey } from "../utils/gridMath";
import {
  buildRoadGraph,
  chargerNodes,
  rackApproachNodes,
  rotationNodes,
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

export function validateConnectivity(layout: WarehouseLayout): ConnectivityResult {
  const graph = buildRoadGraph(layout);
  const reverse = reverseGraph(graph);
  const stationSources = layout.stations.flatMap((station) => stationNodes(station, graph));
  const reachableFromStations = reachableFrom(graph, stationSources);
  const canReachStations = reachableFrom(reverse, stationSources);

  const unreachableRacks = new Set<string>();
  const reachableRacks = new Set<string>();
  for (const rack of layout.racks) {
    const approaches = rackApproachNodes(layout, rack, graph);
    if (approaches.length === 0 || !approaches.some((node) => canReachStations.has(node))) {
      unreachableRacks.add(rack.id);
    } else {
      reachableRacks.add(rack.id);
    }
  }

  const unreachableStations = new Set<string>();
  for (const station of layout.stations) {
    const nodes = stationNodes(station, graph);
    if (nodes.length === 0 || !nodes.some((node) => reachableFromStations.has(node))) {
      unreachableStations.add(station.id);
    }
  }

  const unreachableChargers = new Set<string>();
  for (const charger of layout.chargingSpots) {
    const nodes = chargerNodes(charger, graph);
    if (nodes.length === 0 || !nodes.some((node) => reachableFromStations.has(node))) {
      unreachableChargers.add(charger.id);
    }
  }

  const unreachableParking = new Set<string>();
  for (const parking of layout.parkingSpots) {
    const node = cellKey(parking.cell);
    if (!graph.nodes.has(node) || !reachableFromStations.has(node)) {
      unreachableParking.add(parking.id);
    }
  }

  const unreachableRotationZones = new Set<string>();
  for (const zone of layout.rotationZones) {
    const nodes = rotationNodes(zone, graph);
    if (nodes.length === 0 || !nodes.some((node) => reachableFromStations.has(node))) {
      unreachableRotationZones.add(zone.id);
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

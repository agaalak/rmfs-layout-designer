import type { WarehouseLayout } from "../models/layout";
import { buildRoadGraph, chargerNodes, objectApproachNodes, rotationNodes, stationNodes } from "../graph/graphBuilder";
import { dijkstraFromSources, reverseGraph } from "../graph/shortestPath";
import { cellKey } from "../utils/gridMath";
import { mean, percentile } from "../utils/units";

export interface DistanceMetrics {
  averageRackToNearestStationDistance: number;
  medianRackToNearestStationDistance: number;
  p90RackToNearestStationDistance: number;
  maxRackToStationDistance: number;
  averageStationToChargerDistance: number;
  averageStationToParkingDistance: number;
  averageRackToRotationZoneDistance: number;
}

export function calculateDistanceMetrics(layout: WarehouseLayout): DistanceMetrics {
  const graph = buildRoadGraph(layout);
  const stationSources = layout.stations.flatMap((station) => stationNodes(station, graph));
  const toStation = dijkstraFromSources(reverseGraph(graph), stationSources);
  const rackDistances = layout.racks
    .map((rack) => objectApproachNodes(layout, rack.homeCell, graph).map((node) => toStation.get(node) ?? Infinity))
    .map((distances) => Math.min(...distances))
    .filter(Number.isFinite);

  const fromStations = dijkstraFromSources(graph, stationSources);
  const chargerDistances = layout.chargingSpots
    .map((charger) => chargerNodes(charger, graph).map((node) => fromStations.get(node) ?? Infinity))
    .map((distances) => Math.min(...distances))
    .filter(Number.isFinite);
  const parkingDistances = layout.parkingSpots
    .map((parking) => fromStations.get(cellKey(parking.cell)) ?? Infinity)
    .filter(Number.isFinite);

  const rotationSources = layout.rotationZones.flatMap((zone) => rotationNodes(zone, graph));
  const toRotation = dijkstraFromSources(reverseGraph(graph), rotationSources);
  const rackToRotationDistances = layout.racks
    .map((rack) => objectApproachNodes(layout, rack.homeCell, graph).map((node) => toRotation.get(node) ?? Infinity))
    .map((distances) => Math.min(...distances))
    .filter(Number.isFinite);

  return {
    averageRackToNearestStationDistance: mean(rackDistances),
    medianRackToNearestStationDistance: percentile(rackDistances, 50),
    p90RackToNearestStationDistance: percentile(rackDistances, 90),
    maxRackToStationDistance: rackDistances.length ? Math.max(...rackDistances) : 0,
    averageStationToChargerDistance: mean(chargerDistances),
    averageStationToParkingDistance: mean(parkingDistances),
    averageRackToRotationZoneDistance: mean(rackToRotationDistances)
  };
}

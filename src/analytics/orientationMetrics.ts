import type { WarehouseLayout } from "../models/layout";
import { buildRoadGraph, rackApproachNodes, rotationCellNodes, stationNodes } from "../graph/graphBuilder";
import { dijkstraFromSources, reverseGraph } from "../graph/shortestPath";
import { cellKey } from "../utils/gridMath";
import { mean } from "../utils/units";

export interface OrientationMetrics {
  percentPreStationRotation: number;
  percentPostStationRotation: number;
  averageRotationDetourDistance: number;
  averageRotationTimePenalty: number;
  invalidOrientationCount: number;
  stationFaceAccessViolationCount: number;
  warnings: string[];
}

export function calculateOrientationMetrics(layout: WarehouseLayout): OrientationMetrics {
  const graph = buildRoadGraph(layout);
  const reverse = reverseGraph(graph);
  const comboCount = Math.max(1, layout.racks.length * layout.stations.length);
  let pre = 0;
  let post = 0;
  let invalidOrientationCount = 0;
  let faceViolations = 0;
  const detours: number[] = [];
  const penalties: number[] = [];
  const warnings = new Set<string>();

  const rotationNodesByOrientation = new Map<number, string[]>();
  const rotationDistanceMapsByOrientation = new Map<
    number,
    { toRotation: Map<string, number>; fromRotation: Map<string, number> }
  >();
  for (const orientation of [0, 90, 180, 270]) {
    const nodes = rotationCellNodes(layout, graph).filter((node) => {
      const cell = layout.cells.find((candidate) => cellKey(candidate) === node);
      return cell?.supportedRotationOrientationsDeg?.includes(orientation as 0 | 90 | 180 | 270);
    });
    rotationNodesByOrientation.set(orientation, nodes);
    rotationDistanceMapsByOrientation.set(orientation, {
      toRotation: dijkstraFromSources(reverse, nodes),
      fromRotation: dijkstraFromSources(graph, nodes)
    });
  }

  const stationToRackDistanceMaps = new Map<string, Map<string, number>>();
  const rackToStationDistanceMaps = new Map<string, Map<string, number>>();
  const stationNodeMap = new Map<string, string[]>();
  for (const station of layout.stations) {
    const nodes = stationNodes(station, graph);
    stationNodeMap.set(station.id, nodes);
    rackToStationDistanceMaps.set(station.id, dijkstraFromSources(reverse, nodes));
    stationToRackDistanceMaps.set(station.id, dijkstraFromSources(graph, nodes));
  }

  for (const rack of layout.racks) {
    const rackFaces = new Set(rack.faces.map((face) => face.faceId));
    const approachNodes = rackApproachNodes(layout, rack, graph);
    for (const station of layout.stations) {
      if (!station.acceptedRackFaces.some((face) => rackFaces.has(face))) {
        faceViolations += 1;
      }
      if (!rack.allowedOrientationsDeg.includes(station.requiredRackOrientationDeg)) {
        invalidOrientationCount += 1;
      }
      const requiresPre = rack.currentOrientationDeg !== station.requiredRackOrientationDeg;
      const requiresPost = station.requiredRackOrientationDeg !== rack.currentOrientationDeg;
      let rotations = 0;
      let detour = 0;
      const directToStation = Math.min(
        ...approachNodes.map((node) => rackToStationDistanceMaps.get(station.id)?.get(node) ?? Infinity)
      );
      if (requiresPre) {
        pre += 1;
        rotations += 1;
        const rotationNodesForStation = rotationNodesByOrientation.get(station.requiredRackOrientationDeg) ?? [];
        if (rotationNodesForStation.length === 0) {
          invalidOrientationCount += 1;
          warnings.add(`No rotation-enabled cell supports ${station.requiredRackOrientationDeg} degrees.`);
        } else {
          const maps = rotationDistanceMapsByOrientation.get(station.requiredRackOrientationDeg);
          const a = Math.min(...approachNodes.map((node) => maps?.toRotation.get(node) ?? Infinity));
          const stationNodesForTarget = stationNodeMap.get(station.id) ?? [];
          const b = Math.min(...stationNodesForTarget.map((node) => maps?.fromRotation.get(node) ?? Infinity));
          if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(directToStation)) {
            detour += Math.max(0, a + b - directToStation);
          }
        }
      }
      if (requiresPost) {
        post += 1;
        rotations += 1;
        const rotationNodesForHome = rotationNodesByOrientation.get(rack.currentOrientationDeg) ?? [];
        if (rotationNodesForHome.length === 0) {
          invalidOrientationCount += 1;
        } else {
          const fromStation = stationToRackDistanceMaps.get(station.id);
          const maps = rotationDistanceMapsByOrientation.get(rack.currentOrientationDeg);
          const stationTargets = stationNodeMap.get(station.id) ?? [];
          const a = Math.min(...stationTargets.map((node) => maps?.toRotation.get(node) ?? Infinity));
          const b = Math.min(...approachNodes.map((node) => maps?.fromRotation.get(node) ?? Infinity));
          const directHome = Math.min(...approachNodes.map((node) => fromStation?.get(node) ?? Infinity));
          if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(directHome)) {
            detour += Math.max(0, a + b - directHome);
          }
        }
      }
      if (rotations > 0) {
        detours.push(detour);
        penalties.push(rotations * layout.robotAssumptions.rotationTimeSec);
      }
    }
  }

  return {
    percentPreStationRotation: (pre / comboCount) * 100,
    percentPostStationRotation: (post / comboCount) * 100,
    averageRotationDetourDistance: mean(detours),
    averageRotationTimePenalty: mean(penalties),
    invalidOrientationCount,
    stationFaceAccessViolationCount: faceViolations,
    warnings: [...warnings]
  };
}

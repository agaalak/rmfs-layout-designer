import type { WarehouseLayout } from "../models/layout";
import type { ValidationIssue } from "./validateObjects";

export function validateOrientation(layout: WarehouseLayout): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rotationCells = layout.cells.filter((cell) => cell.allowRotation);
  const supported = new Set(rotationCells.flatMap((cell) => cell.supportedRotationOrientationsDeg ?? [0, 90, 180, 270]));
  for (const rack of layout.racks) {
    for (const station of layout.stations) {
      if (!rack.allowedOrientationsDeg.includes(station.requiredRackOrientationDeg)) {
        issues.push({
          id: `orientation_invalid_${rack.id}_${station.id}`,
          severity: "error",
          message: `${rack.rackId} cannot satisfy ${station.stationId}'s required orientation.`,
          cell: rack.homeCell,
          objectId: rack.id
        });
      }
      if (
        rack.currentOrientationDeg !== station.requiredRackOrientationDeg &&
        rotationCells.length > 0 &&
        !supported.has(station.requiredRackOrientationDeg)
      ) {
        issues.push({
          id: `orientation_zone_missing_${rack.id}_${station.id}`,
          severity: "error",
          message: `No rotation-enabled cell supports ${station.requiredRackOrientationDeg} degrees for ${station.stationId}.`,
          cell: station.cell,
          objectId: station.id
        });
      }
      const rackFaces = new Set(rack.faces.map((face) => face.faceId));
      if (!station.acceptedRackFaces.some((face) => rackFaces.has(face))) {
        issues.push({
          id: `face_invalid_${rack.id}_${station.id}`,
          severity: "error",
          message: `${station.stationId} accepts faces ${station.acceptedRackFaces.join("/")} but ${rack.rackId} lacks them.`,
          cell: station.cell,
          objectId: station.id
        });
      }
    }
  }
  return issues;
}

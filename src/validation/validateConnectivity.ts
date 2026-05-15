import type { WarehouseLayout } from "../models/layout";
import { validateConnectivity as calculateConnectivity } from "../graph/connectivity";
import type { ValidationIssue } from "./validateObjects";

export function validateConnectivity(layout: WarehouseLayout): ValidationIssue[] {
  const connectivity = calculateConnectivity(layout);
  const issues: ValidationIssue[] = [];
  for (const rackId of connectivity.unreachableRacks) {
    const rack = layout.racks.find((item) => item.id === rackId);
    issues.push({
      id: `unreachable_rack_${rackId}`,
      severity: "error",
      message: `Rack ${rack?.rackId ?? rackId} is unreachable from stations.`,
      cell: rack?.homeCell,
      objectId: rackId
    });
  }
  for (const stationId of connectivity.unreachableStations) {
    const station = layout.stations.find((item) => item.id === stationId);
    issues.push({
      id: `unreachable_station_${stationId}`,
      severity: "error",
      message: `Station ${station?.stationId ?? stationId} is unreachable.`,
      cell: station?.cell,
      objectId: stationId
    });
  }
  for (const chargerId of connectivity.unreachableChargers) {
    const charger = layout.chargingSpots.find((item) => item.id === chargerId);
    issues.push({
      id: `unreachable_charger_${chargerId}`,
      severity: "error",
      message: `Charger ${charger?.chargerId ?? chargerId} is unreachable.`,
      cell: charger?.cells[0],
      objectId: chargerId
    });
  }
  for (const parkingId of connectivity.unreachableParking) {
    const parking = layout.parkingSpots.find((item) => item.id === parkingId);
    issues.push({
      id: `unreachable_parking_${parkingId}`,
      severity: "error",
      message: `Parking ${parking?.parkingId ?? parkingId} is unreachable.`,
      cell: parking?.cell,
      objectId: parkingId
    });
  }
  for (const zoneId of connectivity.unreachableRotationZones) {
    const key = zoneId.replace("rotation_cell_", "");
    const cell = layout.cells.find((item) => `${item.row}:${item.col}` === key);
    issues.push({
      id: `unreachable_rotation_${zoneId}`,
      severity: "error",
      message: `Rotation-enabled cell ${key} is unreachable.`,
      cell,
      objectId: zoneId
    });
  }
  return issues;
}

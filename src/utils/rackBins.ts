import type { Bin, Rack, RackFace, RackFaceId } from "../models/rack";

export interface BinGenerationOptions {
  widthM?: number;
  depthM?: number;
  heightM?: number;
  barcodePrefix?: string;
  locationPrefix?: string;
}

export function makeBinRecords(
  rackId: string,
  faceId: RackFaceId,
  rows: number,
  columns: number,
  options: BinGenerationOptions = {},
  existing: Bin[] = []
): Bin[] {
  const byPosition = new Map(existing.map((bin) => [`${bin.faceId}:${bin.rowIndex}:${bin.columnIndex}`, bin]));
  const bins: Bin[] = [];
  const widthM = options.widthM ?? existing[0]?.widthM ?? 0.3;
  const depthM = options.depthM ?? existing[0]?.depthM ?? 0.4;
  const heightM = options.heightM ?? existing[0]?.heightM ?? 0.3;
  const barcodePrefix = options.barcodePrefix ?? rackId;
  const locationPrefix = options.locationPrefix ?? rackId;
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const existingBin = byPosition.get(`${faceId}:${rowIndex}:${columnIndex}`);
      bins.push({
        binId: existingBin?.binId ?? `${rackId}_${faceId}_${rowIndex + 1}_${columnIndex + 1}`,
        barcode: existingBin?.barcode ?? `${barcodePrefix}-${faceId}-${rowIndex + 1}-${columnIndex + 1}`,
        locationId: existingBin?.locationId ?? `${locationPrefix}.${faceId}.${rowIndex + 1}.${columnIndex + 1}`,
        faceId,
        rowIndex,
        columnIndex,
        widthM: existingBin?.widthM ?? widthM,
        depthM: existingBin?.depthM ?? depthM,
        heightM: existingBin?.heightM ?? heightM,
        maxWeightKg: existingBin?.maxWeightKg,
        maxQuantity: existingBin?.maxQuantity,
        sku: existingBin?.sku,
        quantity: existingBin?.quantity,
        reservedQuantity: existingBin?.reservedQuantity,
        lastUpdatedSimTimeSec: existingBin?.lastUpdatedSimTimeSec
      });
    }
  }
  return bins;
}

export function regenerateRackBins(rack: Rack, options: BinGenerationOptions = {}): Rack {
  return {
    ...rack,
    faces: rack.faces.map((face) => ({
      ...face,
      bins: makeBinRecords(rack.rackId, face.faceId, face.rows, face.columns, options, face.bins)
    }))
  };
}

export function updateRackBin(rack: Rack, faceId: RackFaceId, binId: string, patch: Partial<Bin>): Rack {
  return {
    ...rack,
    faces: rack.faces.map((face) =>
      face.faceId === faceId
        ? {
            ...face,
            bins: face.bins.map((bin) => (bin.binId === binId ? { ...bin, ...patch } : bin))
          }
        : face
    )
  };
}

export function clearRackSkus(rack: Rack): Rack {
  return {
    ...rack,
    faces: rack.faces.map((face) => ({
      ...face,
      bins: face.bins.map((bin) => ({ ...bin, sku: "", quantity: 0 }))
    }))
  };
}

export function autoNumberRackLocations(rack: Rack, locationPrefix = rack.rackId, barcodePrefix = rack.rackId): Rack {
  return {
    ...rack,
    faces: rack.faces.map((face) => ({
      ...face,
      bins: face.bins.map((bin) => ({
        ...bin,
        barcode: `${barcodePrefix}-${face.faceId}-${bin.rowIndex + 1}-${bin.columnIndex + 1}`,
        locationId: `${locationPrefix}.${face.faceId}.${bin.rowIndex + 1}.${bin.columnIndex + 1}`
      }))
    }))
  };
}

export function rackBinsToCsv(rack: Rack): string {
  const headers = [
    "faceId",
    "rowIndex",
    "columnIndex",
    "binId",
    "barcode",
    "locationId",
    "widthM",
    "depthM",
    "heightM",
    "maxQuantity",
    "reservedQuantity",
    "sku",
    "quantity"
  ];
  const escape = (value: unknown) => {
    const text = value === undefined || value === null ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = rack.faces.flatMap((face) =>
    face.bins.map((bin) =>
      [
        bin.faceId,
        bin.rowIndex,
        bin.columnIndex,
        bin.binId,
        bin.barcode,
        bin.locationId,
        bin.widthM,
        bin.depthM,
        bin.heightM,
        bin.maxQuantity ?? "",
        bin.reservedQuantity ?? "",
        bin.sku ?? "",
        bin.quantity ?? ""
      ].map(escape).join(",")
    )
  );
  return [headers.join(","), ...rows].join("\n");
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

export function rackBinsFromCsv(rack: Rack, csv: string): Rack {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return rack;
  const headers = parseCsvLine(lines[0]);
  const indexOf = (name: string) => headers.indexOf(name);
  const importedBins = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const get = (name: string) => values[indexOf(name)] ?? "";
    const num = (name: string) => {
      const value = Number(get(name));
      return Number.isFinite(value) ? value : undefined;
    };
    return {
      faceId: (get("faceId") || "A") as RackFaceId,
      rowIndex: num("rowIndex") ?? 0,
      columnIndex: num("columnIndex") ?? 0,
      binId: get("binId"),
      barcode: get("barcode"),
      locationId: get("locationId"),
      widthM: num("widthM") ?? 0.3,
      depthM: num("depthM") ?? 0.4,
      heightM: num("heightM") ?? 0.3,
      maxQuantity: num("maxQuantity"),
      reservedQuantity: num("reservedQuantity"),
      sku: get("sku"),
      quantity: num("quantity")
    } satisfies Bin;
  });
  const byFace = new Map<RackFaceId, Bin[]>();
  for (const bin of importedBins) {
    byFace.set(bin.faceId, [...(byFace.get(bin.faceId) ?? []), bin]);
  }
  const faces: RackFace[] = rack.faces.map((face) => {
    const imported = byFace.get(face.faceId);
    if (!imported) return face;
    const maxRow = Math.max(face.rows - 1, ...imported.map((bin) => bin.rowIndex));
    const maxCol = Math.max(face.columns - 1, ...imported.map((bin) => bin.columnIndex));
    return {
      ...face,
      rows: maxRow + 1,
      columns: maxCol + 1,
      bins: imported
    };
  });
  return { ...rack, faces };
}

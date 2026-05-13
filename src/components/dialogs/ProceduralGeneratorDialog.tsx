import { useState } from "react";
import type { GenerationParams } from "../../models/layout";
import { defaultGenerationParams } from "../../generators/proceduralGenerator";
import { useLayoutStore } from "../../store/layoutStore";
import { DialogShell } from "./DialogShell";

interface ProceduralGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ProceduralGeneratorDialog({ open, onClose }: ProceduralGeneratorDialogProps) {
  const generateModeB = useLayoutStore((state) => state.generateModeB);
  const stored = useLayoutStore((state) => state.generationParams);
  const [params, setParams] = useState<GenerationParams>({ ...defaultGenerationParams, ...stored });
  const set = <K extends keyof GenerationParams>(key: K, value: GenerationParams[K]) => setParams((current) => ({ ...current, [key]: value }));
  return (
    <DialogShell title="Generate Mode B Layout" open={open} onClose={onClose}>
      <GeneratorFields params={params} set={set} />
      <div className="mt-4 flex justify-end gap-2">
        <button className="toolbar-button" onClick={onClose}>Cancel</button>
        <button
          className="toolbar-button"
          onClick={() => {
            generateModeB(params);
            onClose();
          }}
        >
          Generate layout
        </button>
      </div>
    </DialogShell>
  );
}

export function GeneratorFields({
  params,
  set
}: {
  params: GenerationParams;
  set: <K extends keyof GenerationParams>(key: K, value: GenerationParams[K]) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        ["rows", "Rows"],
        ["columns", "Columns"],
        ["cellWidthM", "Cell width m"],
        ["cellDepthM", "Cell depth m"],
        ["rackFootprintWidthM", "Rack width m"],
        ["rackFootprintDepthM", "Rack depth m"],
        ["rackFillRatio", "Rack fill ratio"],
        ["verticalAisleSpacing", "Vertical aisle spacing"],
        ["horizontalCrossAisleSpacing", "Cross aisle spacing"],
        ["stationCount", "Station count"],
        ["chargerCount", "Charger count"],
        ["parkingSpotCount", "Parking count"],
        ["rotationZoneCount", "Rotation zones"],
        ["candidateCount", "Candidate count"]
      ].map(([key, label]) => (
        <label key={key} className="flex flex-col gap-1">
          <span className="field-label">{label}</span>
          <input
            className="field-input"
            type="number"
            step={key === "rackFillRatio" || String(key).includes("Width") || String(key).includes("Depth") ? "0.1" : "1"}
            value={params[key as keyof GenerationParams] as number}
            onChange={(event) => set(key as keyof GenerationParams, Number(event.target.value) as never)}
          />
        </label>
      ))}
      <label className="flex flex-col gap-1">
        <span className="field-label">Physical width m</span>
        <input
          className="field-input"
          type="number"
          step="0.1"
          value={(params.columns * params.cellWidthM).toFixed(1)}
          onChange={(event) => set("columns", Math.max(1, Math.round(Number(event.target.value) / params.cellWidthM)))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="field-label">Physical depth m</span>
        <input
          className="field-input"
          type="number"
          step="0.1"
          value={(params.rows * params.cellDepthM).toFixed(1)}
          onChange={(event) => set("rows", Math.max(1, Math.round(Number(event.target.value) / params.cellDepthM)))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="field-label">Layout family</span>
        <select className="field-input" value={params.layoutFamily} onChange={(event) => set("layoutFamily", event.target.value as GenerationParams["layoutFamily"])}>
          <option value="traditional_external">Traditional external</option>
          <option value="internal_centralized">Internal centralized</option>
          <option value="internal_distributed">Internal distributed</option>
          <option value="hybrid_external_internal">Hybrid external/internal</option>
          <option value="dense_with_cross_aisles">Dense with cross aisles</option>
          <option value="flying_v_placeholder">Flying-V placeholder</option>
          <option value="true_flying_v">True Flying-V diagonal</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="field-label">Station placement</span>
        <select className="field-input" value={params.stationPlacementStrategy} onChange={(event) => set("stationPlacementStrategy", event.target.value as GenerationParams["stationPlacementStrategy"])}>
          <option value="external">External</option>
          <option value="internal-centralized">Internal centralized</option>
          <option value="internal-distributed">Internal distributed</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="field-label">Charger size</span>
        <select className="field-input" value={params.chargerSizeCells} onChange={(event) => set("chargerSizeCells", Number(event.target.value) as 1 | 2)}>
          <option value={1}>1 grid cell</option>
          <option value={2}>2 grid cells</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="field-label">Traffic mode</span>
        <select className="field-input" value={params.trafficMode} onChange={(event) => set("trafficMode", event.target.value as GenerationParams["trafficMode"])}>
          <option value="two_way">Two-way</option>
          <option value="one_way">One-way</option>
        </select>
      </label>
    </div>
  );
}

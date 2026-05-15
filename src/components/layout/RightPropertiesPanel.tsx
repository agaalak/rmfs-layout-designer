import type { ChangeEvent, ReactNode } from "react";
import type { Bin, CardinalOrientation, DemandClass, Rack, RackFaceId } from "../../models/rack";
import type { ServiceSide, Station, StationType } from "../../models/station";
import type { ChargingSpot } from "../../models/charging";
import type { ParkingSpot, ParkingType } from "../../models/parking";
import type { CellType, Direction, GridCell, GridConfig, LayoutCell, LayoutMode } from "../../models/grid";
import { allDirections, traversableCellTypes } from "../../models/grid";
import { makeRackBins } from "../../generators/proceduralGenerator";
import { selectedObject, useCurrentLayout, useLayoutStore } from "../../store/layoutStore";
import { useUiStore } from "../../store/uiStore";
import type { AnalyticsResult } from "../../analytics/types";
import type { ValidationResult } from "../../validation/validateLayout";
import type { ValidationIssue } from "../../validation/validateObjects";
import { cellKey, deriveDimensions } from "../../utils/gridMath";
import { rackFootprintCells } from "../../utils/rackFootprint";
import { autoNumberRackLocations, clearRackSkus, rackBinsFromCsv, rackBinsToCsv, regenerateRackBins, updateRackBin } from "../../utils/rackBins";
import { downloadTextFile } from "../../importExport/exportLayout";
import { cn } from "../../utils/cn";

interface RightPropertiesPanelProps {
  validation: ValidationResult;
  analytics: AnalyticsResult;
  onSelectIssue: (issue: ValidationIssue) => void;
  display?: "desktop" | "drawer";
}

function Field({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function PropertyTabStrip({ tabs }: { tabs: string[] }) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Property sections">
      {tabs.map((tab, index) => (
        <span key={tab} role="tab" aria-selected={index === 0} className={index === 0 ? "toolbar-button-primary h-7" : "toolbar-button h-7"}>
          {tab}
        </span>
      ))}
    </div>
  );
}

function ObjectValidationIssues({
  issues,
  onSelectIssue
}: {
  issues: ValidationIssue[];
  onSelectIssue: (issue: ValidationIssue) => void;
}) {
  if (issues.length === 0) {
    return (
      <section className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
        No validation issues for the current selection.
      </section>
    );
  }
  return (
    <section className="flex min-h-0 flex-col">
      <div className="panel-title">Selection Validation</div>
      <div className="mt-2 max-h-40 overflow-auto rounded-md border border-border bg-white">
        {issues.map((issue) => (
          <button key={issue.id} className="block w-full border-b border-border p-2 text-left text-xs last:border-b-0 hover:bg-slate-50" onClick={() => onSelectIssue(issue)}>
            <div className={issue.severity === "error" ? "font-semibold text-red-600" : "font-semibold text-amber-700"}>{issue.severity.toUpperCase()}</div>
            <div>{issue.message}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

const number = (event: ChangeEvent<HTMLInputElement>) => Number(event.target.value);

export function RightPropertiesPanel({ validation, analytics, onSelectIssue, display = "desktop" }: RightPropertiesPanelProps) {
  const layout = useCurrentLayout();
  const selected = useLayoutStore((state) => state.selected);
  const selectedCell = useLayoutStore((state) => state.selectedCell);
  const {
    updateLayoutMeta,
    updateRack,
    updateStation,
    updateCharger,
    updateParking,
    updateRotation,
    moveObject,
    setCellDirections,
    updateCell,
    toggleSelectedLock,
    newLayout,
    loadSmallDemo,
    loadLargeDemo
  } = useLayoutStore();
  const setWorkflow = useUiStore((state) => state.setWorkflow);
  const object = selectedObject(layout, selected);
  const first = selected[0];
  const selectedLayoutCell = selectedCell ? layout.cells.find((cell) => cellKey(cell) === cellKey(selectedCell)) : undefined;
  const relatedIssues = validation.issues.filter((issue) => {
    if (first) return issue.objectId === first.id;
    if (selectedCell && issue.cell) return cellKey(selectedCell) === cellKey(issue.cell);
    return false;
  });

  return (
    <aside
      className={cn(
        display === "desktop"
          ? "hidden w-80 shrink-0 flex-col gap-4 overflow-auto border-l border-border bg-panel p-3 xl:flex"
          : "flex h-full w-full flex-col gap-4 overflow-auto bg-panel p-3"
      )}
      aria-label="Properties panel"
    >
      <div>
        <div className="panel-title">Properties</div>
        <div className="mt-2 text-xs text-muted-foreground">
          {first ? `${first.kind} selected` : selectedCell ? `Cell ${selectedCell.row}, ${selectedCell.col}` : "Layout settings"}
        </div>
      </div>
      {!first && selectedCell ? (
        <TrafficCellProperties cell={selectedCell} layoutCell={selectedLayoutCell} setCellDirections={setCellDirections} updateCell={updateCell} toggleLock={toggleSelectedLock} />
      ) : null}
      {!first && !selectedCell ? (
        <section className="flex flex-col gap-2">
          <div className="rounded-md border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800">
            <div className="font-semibold">Quick start</div>
            <div className="mt-1 text-teal-700">Use Design tools to draw roads, place racks and stations, then switch to Analyze to validate the layout.</div>
            <div className="mt-3 grid gap-2">
              <button className="toolbar-button-primary justify-center" onClick={() => newLayout()}>
                Start empty Mode A layout
              </button>
              <button className="toolbar-button justify-center" onClick={() => setWorkflow("generate")}>
                Generate layout
              </button>
              <button className="toolbar-button justify-center" onClick={() => loadSmallDemo()}>
                Load Small Demo
              </button>
              <button className="toolbar-button justify-center" onClick={() => loadLargeDemo()}>
                Load Large Demo
              </button>
            </div>
          </div>
          <Field label="Layout name">
            <input className="field-input" value={layout.name} onChange={(event) => updateLayoutMeta({ name: event.target.value })} />
          </Field>
          <Field label="Mode">
            <select className="field-input" value={layout.mode} onChange={(event) => updateLayoutMeta({ mode: event.target.value as LayoutMode })}>
              <option value="manual">Mode A manual</option>
              <option value="procedural">Mode B procedural</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cell width m">
              <input className="field-input" type="number" step="0.1" value={layout.grid.cellWidthM} onChange={(event) => updateLayoutMeta({ grid: { ...layout.grid, cellWidthM: number(event) } })} />
            </Field>
            <Field label="Cell depth m">
              <input className="field-input" type="number" step="0.1" value={layout.grid.cellDepthM} onChange={(event) => updateLayoutMeta({ grid: { ...layout.grid, cellDepthM: number(event) } })} />
            </Field>
            <Field label="Rows">
              <input className="field-input" type="number" value={layout.grid.rows} onChange={(event) => updateLayoutMeta({ grid: { ...layout.grid, rows: number(event) } })} />
            </Field>
            <Field label="Columns">
              <input className="field-input" type="number" value={layout.grid.columns} onChange={(event) => updateLayoutMeta({ grid: { ...layout.grid, columns: number(event) } })} />
            </Field>
          </div>
          <div className="rounded-md border border-border bg-slate-50 p-2 text-xs text-muted-foreground">
            Physical size: {deriveDimensions(layout.grid).widthM.toFixed(1)} m x {deriveDimensions(layout.grid).depthM.toFixed(1)} m
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Physical width m">
              <input
                className="field-input"
                type="number"
                step="0.1"
                value={deriveDimensions(layout.grid).widthM}
                onChange={(event) => updateLayoutMeta({ grid: { ...layout.grid, columns: Math.max(1, Math.round(number(event) / layout.grid.cellWidthM)) } })}
              />
            </Field>
            <Field label="Physical depth m">
              <input
                className="field-input"
                type="number"
                step="0.1"
                value={deriveDimensions(layout.grid).depthM}
                onChange={(event) => updateLayoutMeta({ grid: { ...layout.grid, rows: Math.max(1, Math.round(number(event) / layout.grid.cellDepthM)) } })}
              />
            </Field>
          </div>
        </section>
      ) : null}
      {first?.kind === "rack" && object ? (
        <RackProperties rack={object as Rack} grid={layout.grid} updateRack={updateRack} move={(row, col) => moveObject(first, { row, col })} toggleLock={toggleSelectedLock} />
      ) : null}
      {first?.kind === "station" && object ? (
        <StationProperties station={object as Station} updateStation={updateStation} move={(row, col) => moveObject(first, { row, col })} toggleLock={toggleSelectedLock} />
      ) : null}
      {first?.kind === "charger" && object ? (
        <ChargerProperties charger={object as ChargingSpot} updateCharger={updateCharger} toggleLock={toggleSelectedLock} />
      ) : null}
      {first?.kind === "parking" && object ? (
        <ParkingProperties parking={object as ParkingSpot} updateParking={updateParking} move={(row, col) => moveObject(first, { row, col })} toggleLock={toggleSelectedLock} />
      ) : null}
      {(first || selectedCell) ? <ObjectValidationIssues issues={relatedIssues} onSelectIssue={onSelectIssue} /> : null}
    </aside>
  );
}

function TrafficCellProperties({
  cell,
  layoutCell,
  setCellDirections,
  updateCell,
  toggleLock
}: {
  cell: GridCell;
  layoutCell?: LayoutCell;
  setCellDirections: (cell: GridCell, directions: Direction[]) => void;
  updateCell: (cell: GridCell, patch: Partial<LayoutCell>) => void;
  toggleLock: () => void;
}) {
  const directions = layoutCell?.allowedDirections ?? allDirections;
  const isTraversable = layoutCell ? traversableCellTypes.has(layoutCell.cellType) : true;
  const cellTypes: CellType[] = ["EMPTY", "ROAD", "RACK_STORAGE", "QUEUE", "BLOCKED", "HUMAN_ZONE", "DOCK", "CHARGING", "PARKING", "STATION"];
  const setDirections = (next: Direction[]) => {
    setCellDirections(cell, next);
  };
  const toggleDirection = (direction: Direction) => {
    setDirections(directions.includes(direction) ? directions.filter((item) => item !== direction) : [...directions, direction]);
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-md border border-border bg-slate-50 p-2 text-xs text-muted-foreground">
        Configure outgoing traffic from row {cell.row}, column {cell.col}. Empty selected cells become road cells when directions are saved.
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-border bg-white p-2">
          <div className="field-label">Cell type</div>
          <select className="field-input mt-1" value={layoutCell?.cellType ?? "EMPTY"} onChange={(event) => updateCell(cell, { cellType: event.target.value as CellType })}>
            {cellTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-md border border-border bg-white p-2">
          <div className="field-label">Graph status</div>
          <div className={`mt-1 font-medium ${isTraversable ? "text-emerald-700" : "text-amber-700"}`}>
            {isTraversable ? "Traversable" : "Not traversable"}
          </div>
        </div>
      </div>
      <Field label="Zone ID">
        <input className="field-input" value={layoutCell?.zoneId ?? ""} onChange={(event) => updateCell(cell, { zoneId: event.target.value || undefined })} />
      </Field>
      <label className="flex items-center gap-2 rounded-md border border-border bg-white px-2 py-2 text-xs">
        <input type="checkbox" checked={Boolean(layoutCell?.locked)} onChange={toggleLock} />
        Locked hybrid constraint
      </label>
      <div className="grid grid-cols-2 gap-2">
        {allDirections.map((direction) => (
          <label key={direction} className="flex items-center gap-2 rounded-md border border-border bg-white px-2 py-2 text-sm capitalize">
            <input
              type="checkbox"
              checked={directions.includes(direction)}
              onChange={() => toggleDirection(direction)}
            />
            {direction}
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="toolbar-button justify-center" type="button" onClick={() => setDirections(allDirections)}>
          Two-way
        </button>
        <button className="toolbar-button justify-center" type="button" onClick={() => setDirections([])}>
          Block exits
        </button>
        <button className="toolbar-button justify-center" type="button" onClick={() => setDirections(["north", "south"])}>
          North/South
        </button>
        <button className="toolbar-button justify-center" type="button" onClick={() => setDirections(["east", "west"])}>
          East/West
        </button>
      </div>
      <div className="rounded-md border border-border bg-white p-2">
        <label className="mb-2 flex items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={Boolean(layoutCell?.allowRotation)}
            onChange={(event) =>
              updateCell(cell, {
                cellType: layoutCell?.cellType && layoutCell.cellType !== "EMPTY" ? layoutCell.cellType : "ROAD",
                allowRotation: event.target.checked,
                supportedRotationOrientationsDeg: event.target.checked ? layoutCell?.supportedRotationOrientationsDeg ?? [0, 90, 180, 270] : undefined,
                rotationTimeSec: event.target.checked ? layoutCell?.rotationTimeSec ?? 6 : undefined,
                rotationCapacity: event.target.checked ? layoutCell?.rotationCapacity ?? 1 : undefined
              })
            }
          />
          Allow rack rotation on this cell
        </label>
        {layoutCell?.allowRotation ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Rotation time sec">
              <input className="field-input" type="number" value={layoutCell.rotationTimeSec ?? 6} onChange={(event) => updateCell(cell, { rotationTimeSec: number(event) })} />
            </Field>
            <Field label="Rotation capacity">
              <input className="field-input" type="number" value={layoutCell.rotationCapacity ?? 1} onChange={(event) => updateCell(cell, { rotationCapacity: Math.max(1, number(event)) })} />
            </Field>
            {[0, 90, 180, 270].map((orientation) => {
              const supported = layoutCell.supportedRotationOrientationsDeg ?? [0, 90, 180, 270];
              return (
                <label key={orientation} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={supported.includes(orientation as 0 | 90 | 180 | 270)}
                    onChange={() =>
                      updateCell(cell, {
                        supportedRotationOrientationsDeg: supported.includes(orientation as 0 | 90 | 180 | 270)
                          ? supported.filter((item) => item !== orientation)
                          : [...supported, orientation as 0 | 90 | 180 | 270]
                      })
                    }
                  />
                  {orientation} deg
                </label>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function RackProperties({
  rack,
  grid,
  updateRack,
  move,
  toggleLock
}: {
  rack: Rack;
  grid: GridConfig;
  updateRack: (id: string, patch: Partial<Rack>) => void;
  move: (row: number, col: number) => void;
  toggleLock: () => void;
}) {
  const footprint = rackFootprintCells(rack, grid);
  const setRack = (next: Rack) => updateRack(rack.id, { ...next });
  const updateFace = (faceId: RackFaceId, rows: number, columns: number) => {
    updateRack(rack.id, {
      faces: rack.faces.map((face) =>
        face.faceId === faceId
          ? {
              ...face,
              rows,
              columns,
              bins: makeRackBins(
                rack.rackId,
                face.faceId,
                rows,
                columns,
                face.bins[0]?.widthM ?? 0.3,
                face.bins[0]?.depthM ?? 0.4,
                face.bins[0]?.heightM ?? 0.3
              )
            }
          : face
      )
    });
  };
  const updateBinSize = (dimension: "widthM" | "depthM" | "heightM", value: number) => {
    updateRack(rack.id, {
      faces: rack.faces.map((face) => ({
        ...face,
        bins: face.bins.map((bin) => ({ ...bin, [dimension]: value }))
      }))
    });
  };
  const editBin = (faceId: RackFaceId, bin: Bin, patch: Partial<Bin>) => {
    const next = updateRackBin(rack, faceId, bin.binId, patch);
    updateRack(rack.id, { faces: next.faces });
  };
  const importBins = (file?: File) => {
    if (!file) return;
    file.text().then((csv) => {
      const next = rackBinsFromCsv(rack, csv);
      updateRack(rack.id, { faces: next.faces });
    });
  };
  return (
    <section className="flex flex-col gap-2">
      <PropertyTabStrip tabs={["General", "Geometry", "Faces & Bins", "Inventory", "Validation"]} />
      <label className="flex items-center gap-2 rounded-md border border-border bg-white px-2 py-2 text-xs">
        <input type="checkbox" checked={Boolean(rack.locked)} onChange={toggleLock} />
        Locked hybrid constraint
      </label>
      <Field label="Rack ID">
        <input className="field-input" value={rack.rackId} onChange={(event) => updateRack(rack.id, { rackId: event.target.value })} />
      </Field>
      <Field label="Rack type">
        <input className="field-input" value={rack.rackTypeId} onChange={(event) => updateRack(rack.id, { rackTypeId: event.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Home row">
          <input className="field-input" type="number" value={rack.homeCell.row} onChange={(event) => move(number(event), rack.homeCell.col)} />
        </Field>
        <Field label="Home col">
          <input className="field-input" type="number" value={rack.homeCell.col} onChange={(event) => move(rack.homeCell.row, number(event))} />
        </Field>
        <Field label="Footprint W">
          <input className="field-input" type="number" step="0.1" value={rack.footprintWidthM} onChange={(event) => updateRack(rack.id, { footprintWidthM: number(event) })} />
        </Field>
        <Field label="Footprint D">
          <input className="field-input" type="number" step="0.1" value={rack.footprintDepthM} onChange={(event) => updateRack(rack.id, { footprintDepthM: number(event) })} />
        </Field>
        <div className="rounded-md border border-border bg-slate-50 p-2 text-xs text-muted-foreground">
          Footprint cells: {footprint.columns} x {footprint.rows}
        </div>
        <Field label="Height">
          <input className="field-input" type="number" step="0.1" value={rack.heightM} onChange={(event) => updateRack(rack.id, { heightM: number(event) })} />
        </Field>
        <Field label="Orientation">
          <select className="field-input" value={rack.currentOrientationDeg} onChange={(event) => updateRack(rack.id, { currentOrientationDeg: Number(event.target.value) as CardinalOrientation })}>
            {[0, 90, 180, 270].map((orientation) => (
              <option key={orientation} value={orientation}>
                {orientation}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Allowed orientations">
        <input
          className="field-input"
          value={rack.allowedOrientationsDeg.join(",")}
          onChange={(event) =>
            updateRack(rack.id, {
              allowedOrientationsDeg: event.target.value
                .split(",")
                .map((value) => Number(value.trim()))
                .filter((value): value is CardinalOrientation => [0, 90, 180, 270].includes(value))
            })
          }
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {rack.faces.map((face) => (
          <div key={face.faceId} className="rounded-md border border-border bg-white p-2">
            <div className="mb-2 text-xs font-semibold">Face {face.faceId}</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Rows">
                <input className="field-input" type="number" value={face.rows} onChange={(event) => updateFace(face.faceId, number(event), face.columns)} />
              </Field>
              <Field label="Columns">
                <input className="field-input" type="number" value={face.columns} onChange={(event) => updateFace(face.faceId, face.rows, number(event))} />
              </Field>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Bin width">
          <input className="field-input" type="number" step="0.01" value={rack.faces[0]?.bins[0]?.widthM ?? 0.3} onChange={(event) => updateBinSize("widthM", number(event))} />
        </Field>
        <Field label="Bin depth">
          <input className="field-input" type="number" step="0.01" value={rack.faces[0]?.bins[0]?.depthM ?? 0.4} onChange={(event) => updateBinSize("depthM", number(event))} />
        </Field>
        <Field label="Bin height">
          <input className="field-input" type="number" step="0.01" value={rack.faces[0]?.bins[0]?.heightM ?? 0.3} onChange={(event) => updateBinSize("heightM", number(event))} />
        </Field>
      </div>
      <Field label="Demand class">
        <select className="field-input" value={rack.demandClass ?? "HOT"} onChange={(event) => updateRack(rack.id, { demandClass: event.target.value as DemandClass })}>
          <option value="HOT">HOT</option>
          <option value="WARM">WARM</option>
          <option value="COLD">COLD</option>
        </select>
      </Field>
      <div className="rounded-md border border-border bg-white p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rack Bin Editor</div>
            <div className="text-xs text-muted-foreground">{rack.faces.reduce((sum, face) => sum + face.bins.length, 0)} bins across {rack.faces.length} faces</div>
          </div>
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <button
            className="toolbar-button justify-center"
            type="button"
            onClick={() => {
              const hasInventory = rack.faces.some((face) => face.bins.some((bin) => bin.sku || (bin.quantity ?? 0) > 0));
              if (hasInventory && !window.confirm("Regenerate bins? Existing SKU and quantity values will be preserved by matching face/row/column where possible.")) return;
              setRack(regenerateRackBins(rack));
            }}
          >
            Regenerate Bins
          </button>
          <button className="toolbar-button justify-center" type="button" onClick={() => setRack(clearRackSkus(rack))}>
            Clear SKUs
          </button>
          <button className="toolbar-button justify-center" type="button" onClick={() => setRack(autoNumberRackLocations(rack))}>
            Auto-number Locations
          </button>
          <button className="toolbar-button justify-center" type="button" onClick={() => downloadTextFile(`${rack.rackId}_bins.csv`, rackBinsToCsv(rack), "text/csv")}>
            Export Rack Bins CSV
          </button>
          <label className="toolbar-button col-span-2 cursor-pointer justify-center">
            Import Rack Bins CSV
            <input className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => importBins(event.target.files?.[0])} />
          </label>
        </div>
        <div className="max-h-72 overflow-auto rounded border border-border">
          <table className="w-full min-w-[980px] border-collapse text-[11px]">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
              <tr>
                {["Face", "Row", "Col", "Bin ID", "Barcode", "Location", "W", "D", "H", "Max qty", "SKU", "Qty"].map((header) => (
                  <th key={header} className="border-b border-border px-1 py-1 font-semibold">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rack.faces.flatMap((face) =>
                face.bins.map((bin) => (
                  <tr key={`${face.faceId}:${bin.binId}`} className="border-b border-slate-100">
                    <td className="px-1 py-1">{bin.faceId}</td>
                    <td className="px-1 py-1">{bin.rowIndex}</td>
                    <td className="px-1 py-1">{bin.columnIndex}</td>
                    <td className="px-1 py-1"><input className="field-input h-7" value={bin.binId} onChange={(event) => editBin(face.faceId, bin, { binId: event.target.value })} /></td>
                    <td className="px-1 py-1"><input className="field-input h-7" value={bin.barcode} onChange={(event) => editBin(face.faceId, bin, { barcode: event.target.value })} /></td>
                    <td className="px-1 py-1"><input className="field-input h-7" value={bin.locationId} onChange={(event) => editBin(face.faceId, bin, { locationId: event.target.value })} /></td>
                    <td className="px-1 py-1"><input className="field-input h-7 w-16" type="number" step="0.01" value={bin.widthM} onChange={(event) => editBin(face.faceId, bin, { widthM: number(event) })} /></td>
                    <td className="px-1 py-1"><input className="field-input h-7 w-16" type="number" step="0.01" value={bin.depthM} onChange={(event) => editBin(face.faceId, bin, { depthM: number(event) })} /></td>
                    <td className="px-1 py-1"><input className="field-input h-7 w-16" type="number" step="0.01" value={bin.heightM} onChange={(event) => editBin(face.faceId, bin, { heightM: number(event) })} /></td>
                    <td className="px-1 py-1"><input className="field-input h-7 w-20" type="number" value={bin.maxQuantity ?? ""} onChange={(event) => editBin(face.faceId, bin, { maxQuantity: event.target.value === "" ? undefined : number(event) })} /></td>
                    <td className="px-1 py-1"><input className="field-input h-7" value={bin.sku ?? ""} onChange={(event) => editBin(face.faceId, bin, { sku: event.target.value })} /></td>
                    <td className="px-1 py-1"><input className="field-input h-7 w-20" type="number" value={bin.quantity ?? ""} onChange={(event) => editBin(face.faceId, bin, { quantity: event.target.value === "" ? undefined : number(event) })} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function StationProperties({
  station,
  updateStation,
  move,
  toggleLock
}: {
  station: Station;
  updateStation: (id: string, patch: Partial<Station>) => void;
  move: (row: number, col: number) => void;
  toggleLock: () => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <PropertyTabStrip tabs={["General", "Service", "Queue", "Orientation", "Validation"]} />
      <label className="flex items-center gap-2 rounded-md border border-border bg-white px-2 py-2 text-xs">
        <input type="checkbox" checked={Boolean(station.locked)} onChange={toggleLock} />
        Locked hybrid constraint
      </label>
      <Field label="Station ID">
        <input className="field-input" value={station.stationId} onChange={(event) => updateStation(station.id, { stationId: event.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Row">
          <input className="field-input" type="number" value={station.cell.row} onChange={(event) => move(number(event), station.cell.col)} />
        </Field>
        <Field label="Col">
          <input className="field-input" type="number" value={station.cell.col} onChange={(event) => move(station.cell.row, number(event))} />
        </Field>
        <Field label="Type">
          <select className="field-input" value={station.stationType} onChange={(event) => updateStation(station.id, { stationType: event.target.value as StationType })}>
            {["PICK", "REPLENISH", "COMBI", "PACK", "QC", "BUFFER"].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </Field>
        <Field label="Service side">
          <select
            className="field-input"
            value={station.serviceSide}
            onChange={(event) => {
              const serviceSide = event.target.value as ServiceSide;
              updateStation(station.id, {
                serviceSide,
                requiredRackOrientationDeg: { NORTH: 0, EAST: 90, SOUTH: 180, WEST: 270 }[serviceSide] as CardinalOrientation
              });
            }}
          >
            {["NORTH", "SOUTH", "EAST", "WEST"].map((side) => (
              <option key={side}>{side}</option>
            ))}
          </select>
        </Field>
        <Field label="Required orientation">
          <select className="field-input" value={station.requiredRackOrientationDeg} onChange={(event) => updateStation(station.id, { requiredRackOrientationDeg: Number(event.target.value) as CardinalOrientation })}>
            {[0, 90, 180, 270].map((orientation) => (
              <option key={orientation}>{orientation}</option>
            ))}
          </select>
        </Field>
        <Field label="Service time sec">
          <input className="field-input" type="number" value={station.targetServiceTimeSec} onChange={(event) => updateStation(station.id, { targetServiceTimeSec: number(event) })} />
        </Field>
        <Field label="Station capacity">
          <input className="field-input" type="number" value={station.capacity} onChange={(event) => updateStation(station.id, { capacity: Math.max(1, number(event)) })} />
        </Field>
        <div className="rounded-md border border-border bg-slate-50 p-2 text-xs text-muted-foreground">
          Linked queue lanes: {station.queueLaneIds.length}. Queue cells are independent directional cells, not station cells.
        </div>
      </div>
      <Field label="Accepted faces">
        <select className="field-input" value={station.acceptedRackFaces.join("/")} onChange={(event) => updateStation(station.id, { acceptedRackFaces: event.target.value === "A/B" ? ["A", "B"] : [event.target.value as "A" | "B"] })}>
          <option>A/B</option>
          <option>A</option>
          <option>B</option>
        </select>
      </Field>
    </section>
  );
}

function ChargerProperties({
  charger,
  updateCharger,
  toggleLock
}: {
  charger: ChargingSpot;
  updateCharger: (id: string, patch: Partial<ChargingSpot>) => void;
  toggleLock: () => void;
}) {
  const first = charger.cells[0];
  const move = (row: number, col: number) => {
    updateCharger(charger.id, {
      cells: charger.cells.map((cell) => ({ row: row + (cell.row - first.row), col: col + (cell.col - first.col) }))
    });
  };
  return (
    <section className="flex flex-col gap-2">
      <PropertyTabStrip tabs={["General", "Capacity", "Validation"]} />
      <label className="flex items-center gap-2 rounded-md border border-border bg-white px-2 py-2 text-xs">
        <input type="checkbox" checked={Boolean(charger.locked)} onChange={toggleLock} />
        Locked hybrid constraint
      </label>
      <Field label="Charger ID">
        <input className="field-input" value={charger.chargerId} onChange={(event) => updateCharger(charger.id, { chargerId: event.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size cells">
          <select
            className="field-input"
            value={charger.cells.length}
            onChange={(event) => {
              const size = Number(event.target.value);
              updateCharger(charger.id, {
                cells: size === 2 ? [first, { row: first.row, col: first.col + 1 }] : [first],
                capacityRobots: size
              });
            }}
          >
            <option value={1}>1 grid</option>
            <option value={2}>2 grids</option>
          </select>
        </Field>
        <Field label="Capacity robots">
          <input className="field-input" type="number" value={charger.capacityRobots} onChange={(event) => updateCharger(charger.id, { capacityRobots: number(event) })} />
        </Field>
        <Field label="Row">
          <input className="field-input" type="number" value={first.row} onChange={(event) => move(number(event), first.col)} />
        </Field>
        <Field label="Col">
          <input className="field-input" type="number" value={first.col} onChange={(event) => move(first.row, number(event))} />
        </Field>
      </div>
      <Field label="Charger type">
        <input className="field-input" value={charger.chargerType ?? ""} onChange={(event) => updateCharger(charger.id, { chargerType: event.target.value })} />
      </Field>
    </section>
  );
}

function ParkingProperties({
  parking,
  updateParking,
  move,
  toggleLock
}: {
  parking: ParkingSpot;
  updateParking: (id: string, patch: Partial<ParkingSpot>) => void;
  move: (row: number, col: number) => void;
  toggleLock: () => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <PropertyTabStrip tabs={["General", "Validation"]} />
      <label className="flex items-center gap-2 rounded-md border border-border bg-white px-2 py-2 text-xs">
        <input type="checkbox" checked={Boolean(parking.locked)} onChange={toggleLock} />
        Locked hybrid constraint
      </label>
      <Field label="Parking ID">
        <input className="field-input" value={parking.parkingId} onChange={(event) => updateParking(parking.id, { parkingId: event.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Row">
          <input className="field-input" type="number" value={parking.cell.row} onChange={(event) => move(number(event), parking.cell.col)} />
        </Field>
        <Field label="Col">
          <input className="field-input" type="number" value={parking.cell.col} onChange={(event) => move(parking.cell.row, number(event))} />
        </Field>
      </div>
      <Field label="Parking type">
        <select className="field-input" value={parking.parkingType} onChange={(event) => updateParking(parking.id, { parkingType: event.target.value as ParkingType })}>
          {["IDLE", "WAITING", "BUFFER", "MAINTENANCE"].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </Field>
      <div className="rounded-md border border-border bg-slate-50 p-2 text-xs text-muted-foreground">
        Parking spots occupy exactly 1 grid cell.
      </div>
    </section>
  );
}

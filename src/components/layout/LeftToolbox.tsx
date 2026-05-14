import {
  BatteryCharging,
  Box,
  Columns3,
  DoorOpen,
  Eraser,
  Hand,
  MousePointer2,
  Move,
  ParkingSquare,
  Route,
  RotateCw,
  SplitSquareVertical,
  Square,
  TrafficCone,
  UserRound
} from "lucide-react";
import { useUiStore, type EditorTool } from "../../store/uiStore";
import { cn } from "../../utils/cn";

const toolMeta: Record<EditorTool, { label: string; ariaLabel: string; icon: typeof MousePointer2; hint: string; shortcut?: string }> = {
  select: { label: "Select / move", ariaLabel: "Select / grab / move", icon: MousePointer2, hint: "Click objects to inspect or drag them on the grid.", shortcut: "V" },
  pan: { label: "Pan", ariaLabel: "Pan", icon: Hand, hint: "Drag the canvas view without editing cells.", shortcut: "Space" },
  road: { label: "Road / aisle", ariaLabel: "Draw road / aisle", icon: Route, hint: "Paint traversable robot aisle cells." },
  "rack-storage": { label: "Rack storage", ariaLabel: "Draw rack storage", icon: Columns3, hint: "Paint storage cells before placing racks." },
  queue: { label: "Queue lane", ariaLabel: "Add queue lane", icon: Move, hint: "Paint station queue/approach cells." },
  blocked: { label: "Blocked / wall / column", ariaLabel: "Blocked / wall / column", icon: Square, hint: "Paint walls, columns, or no-go cells." },
  "human-zone": { label: "Human zone", ariaLabel: "Add human work zone", icon: UserRound, hint: "Mark human work areas as non-routing constraints." },
  dock: { label: "Door / dock", ariaLabel: "Add door / dock", icon: DoorOpen, hint: "Mark dock or door cells." },
  eraser: { label: "Eraser", ariaLabel: "Eraser / delete", icon: Eraser, hint: "Clear cells or remove unlocked objects." },
  rack: { label: "Rack / pod", ariaLabel: "Add rack / pod", icon: Box, hint: "Place a mobile storage rack/pod." },
  station: { label: "Station", ariaLabel: "Add station", icon: SplitSquareVertical, hint: "Place pick, replenish, or service stations." },
  charger: { label: "Charging spot", ariaLabel: "Add charging spot", icon: BatteryCharging, hint: "Place a 1- or 2-cell charger." },
  parking: { label: "Parking spot", ariaLabel: "Add parking spot", icon: ParkingSquare, hint: "Place a one-cell robot parking location." },
  rotation: { label: "Rotation zone", ariaLabel: "Add rotation zone", icon: RotateCw, hint: "Place a rack orientation-change zone." },
  traffic: { label: "Direction tool", ariaLabel: "Traffic direction tool", icon: TrafficCone, hint: "Select a traversable cell, then configure allowed directions in Properties." }
};

const groups: Array<{ title: string; tools: EditorTool[] }> = [
  { title: "Navigation", tools: ["select", "pan"] },
  { title: "Draw Cells", tools: ["road", "rack-storage", "queue", "blocked", "human-zone", "dock", "eraser"] },
  { title: "Place Resources", tools: ["rack", "station", "charger", "parking", "rotation"] },
  { title: "Traffic", tools: ["traffic"] }
];

export function LeftToolbox() {
  const { activeTool, workflow, appMode, setTool } = useUiStore();
  const disabled = appMode === "simulation" || workflow !== "design";
  const activeHint = toolMeta[activeTool]?.hint;
  return (
    <aside className="w-64 shrink-0 overflow-auto border-r border-border bg-panel p-3 max-lg:w-16 max-lg:p-2" aria-label="Design toolbox">
      <div className="mb-3 max-lg:hidden">
        <div className="panel-title">Design Tools</div>
        <div className="mt-1 text-xs text-muted-foreground">Grouped by the task you are doing.</div>
      </div>
      <div className="flex flex-col gap-2">
        {groups.map((group) => (
          <details key={group.title} className="rounded-md border border-border bg-white" open>
            <summary className="cursor-pointer px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 max-lg:hidden">{group.title}</summary>
            <div className="flex flex-col gap-1 p-1">
              {group.tools.map((tool) => {
                const meta = toolMeta[tool];
                const Icon = meta.icon;
                const toolDisabled = disabled && tool !== "select" && tool !== "pan";
                return (
                  <button
                    key={tool}
                    className={cn("tool-button", activeTool === tool && "tool-button-active", toolDisabled && "opacity-45")}
                    disabled={toolDisabled}
                    title={toolDisabled ? "Switch to Design workflow to edit the layout. Simulation locks editing." : `${meta.label}. ${meta.hint}`}
                    aria-label={meta.ariaLabel}
                    aria-pressed={activeTool === tool}
                    onClick={() => setTool(tool)}
                  >
                    <Icon data-icon="inline-start" />
                    <span className="truncate max-lg:hidden">{meta.label}</span>
                    {meta.shortcut ? <span className="ml-auto text-[10px] text-muted-foreground max-lg:hidden">{meta.shortcut}</span> : null}
                  </button>
                );
              })}
            </div>
          </details>
        ))}
      </div>
      <div className="mt-3 rounded-md border border-border bg-slate-50 p-2 text-xs text-muted-foreground max-lg:hidden">
        {disabled
          ? "Editing is disabled outside Design. Return to Design to draw, place, or move layout objects."
          : activeHint}
      </div>
    </aside>
  );
}

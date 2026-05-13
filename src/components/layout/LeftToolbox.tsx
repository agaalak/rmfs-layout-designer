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

const tools: Array<{ id: EditorTool; label: string; icon: typeof MousePointer2 }> = [
  { id: "select", label: "Select / grab / move", icon: MousePointer2 },
  { id: "pan", label: "Pan", icon: Hand },
  { id: "road", label: "Draw road / aisle", icon: Route },
  { id: "rack-storage", label: "Draw rack storage", icon: Columns3 },
  { id: "rack", label: "Add rack / pod", icon: Box },
  { id: "station", label: "Add station", icon: SplitSquareVertical },
  { id: "queue", label: "Add queue lane", icon: Move },
  { id: "charger", label: "Add charging spot", icon: BatteryCharging },
  { id: "parking", label: "Add parking spot", icon: ParkingSquare },
  { id: "rotation", label: "Add rotation zone", icon: RotateCw },
  { id: "blocked", label: "Blocked / wall / column", icon: Square },
  { id: "human-zone", label: "Human work zone", icon: UserRound },
  { id: "dock", label: "Door / dock", icon: DoorOpen },
  { id: "eraser", label: "Eraser / delete cell", icon: Eraser },
  { id: "traffic", label: "Traffic direction tool", icon: TrafficCone }
];

export function LeftToolbox() {
  const { activeTool, appMode, setTool } = useUiStore();
  const disabled = appMode === "simulation";
  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-3 border-r border-border bg-panel p-3 md:flex">
      <div>
        <div className="panel-title">Tools</div>
        <div className="mt-2 flex flex-col gap-1">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                className={cn("tool-button", activeTool === tool.id && "tool-button-active", disabled && tool.id !== "select" && tool.id !== "pan" && "opacity-45")}
                disabled={disabled && tool.id !== "select" && tool.id !== "pan"}
                onClick={() => setTool(tool.id)}
              >
                <Icon data-icon="inline-start" />
                <span className="truncate">{tool.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="rounded-md border border-border bg-slate-50 p-2 text-xs text-muted-foreground">
        {disabled
          ? "Experimental Simulation Mode locks layout editing. Use the simulation panel for early playback checks, not final MAPF validation."
          : "Drag objects to move. Shift-click or drag a rectangle to multi-select. Press R to rotate, Delete to remove, Ctrl+C/Ctrl+V to copy racks."}
      </div>
    </aside>
  );
}

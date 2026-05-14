import { BarChart3, Boxes, FileJson, FlaskConical, Hammer } from "lucide-react";
import { useUiStore, type Workflow } from "../../store/uiStore";
import { cn } from "../../utils/cn";

const workflows: Array<{ id: Workflow; label: string; icon: typeof Boxes; badge?: string; helper: string }> = [
  { id: "design", label: "Design", icon: Boxes, helper: "Manual layout editing" },
  { id: "generate", label: "Generate", icon: Hammer, helper: "Procedural and hybrid layouts" },
  { id: "analyze", label: "Analyze", icon: BarChart3, helper: "Validation, metrics, heatmaps" },
  { id: "simulation", label: "Simulate", icon: FlaskConical, badge: "Experimental", helper: "2D playback checks" },
  { id: "files", label: "Files", icon: FileJson, helper: "Import, export, reports" }
];

export function WorkflowRail() {
  const { workflow, setWorkflow } = useUiStore();
  return (
    <nav className="flex w-24 shrink-0 flex-col gap-2 border-r border-border bg-slate-950 px-2 py-3 text-slate-100 max-lg:w-16" aria-label="Primary workflows">
      {workflows.map((item) => {
        const Icon = item.icon;
        const active = workflow === item.id;
        return (
          <button
            key={item.id}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md border border-transparent px-1 text-center text-[11px] font-medium transition focus:outline-none focus:ring-2 focus:ring-teal-300",
              active ? "border-teal-400 bg-teal-700 text-white shadow-panel" : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
            title={`${item.label}: ${item.helper}`}
            aria-label={`${item.label} workflow${item.badge ? `, ${item.badge}` : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => setWorkflow(item.id)}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="max-lg:hidden">{item.label}</span>
            {item.badge ? <span className="rounded bg-amber-200 px-1 text-[9px] font-semibold text-amber-950 max-lg:hidden">{item.badge}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

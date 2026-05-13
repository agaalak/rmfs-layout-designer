import type { CandidateSortKey, CandidateComparisonState } from "../../store/layoutStore";

interface CandidateComparisonDrawerProps {
  comparison?: CandidateComparisonState;
  onSelect: (candidateId: string) => void;
  onSort: (sortKey: CandidateSortKey) => void;
  onApply: () => void;
  onClose: () => void;
}

const sortOptions: { key: CandidateSortKey; label: string }[] = [
  { key: "overallLayoutScore", label: "Overall score" },
  { key: "storageDensity", label: "Storage density" },
  { key: "averageRackToStationDistance", label: "Average distance" },
  { key: "p90RackToStationDistance", label: "P90 distance" },
  { key: "congestionRiskScore", label: "Congestion risk" },
  { key: "validationErrorCount", label: "Validation errors" }
];

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number) {
  return value.toFixed(1);
}

export function CandidateComparisonDrawer({ comparison, onSelect, onSort, onApply, onClose }: CandidateComparisonDrawerProps) {
  if (!comparison) return null;
  const top3 = comparison.summaries.slice(0, 3);
  return (
    <aside className="absolute bottom-3 left-3 right-3 z-20 max-h-[42vh] overflow-hidden rounded-md border border-slate-300 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-border bg-slate-50 px-3 py-2">
        <div>
          <div className="text-sm font-semibold">Generated Layout Candidates</div>
          <div className="text-xs text-muted-foreground">
            {comparison.summaries.length} candidates generated. Select a row to preview it on the canvas, then apply to edit.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            Sort by
            <select className="field-input h-8 w-44" value={comparison.sortKey} onChange={(event) => onSort(event.target.value as CandidateSortKey)}>
              {sortOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button className="toolbar-button" onClick={onApply}>
            Apply Selected Candidate
          </button>
          <button className="icon-button" title="Close candidate drawer" onClick={onClose}>
            X
          </button>
        </div>
      </div>
      <div className="grid max-h-[32vh] grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-white text-left text-slate-600">
              <tr>
                {["Candidate", "Family", "Racks", "Stations", "Chargers", "Parking", "Density", "Avg dist", "P90 dist", "Congestion", "Orient.", "Score", "Errors"].map((header) => (
                  <th key={header} className="border-b border-border px-2 py-2 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.summaries.map((summary) => {
                const selected = summary.candidateId === comparison.selectedCandidateId;
                return (
                  <tr
                    key={summary.candidateId}
                    className={`cursor-pointer ${selected ? "bg-teal-50 outline outline-2 outline-teal-600" : "hover:bg-slate-50"}`}
                    onClick={() => onSelect(summary.candidateId)}
                  >
                    <td className="whitespace-nowrap px-2 py-2 font-semibold">{summary.candidateId}</td>
                    <td className="px-2 py-2">{summary.layoutFamily}</td>
                    <td className="px-2 py-2">{summary.rackCount}</td>
                    <td className="px-2 py-2">{summary.stationCount}</td>
                    <td className="px-2 py-2">{summary.chargerCount}</td>
                    <td className="px-2 py-2">{summary.parkingCount}</td>
                    <td className="px-2 py-2">{pct(summary.storageDensity)}</td>
                    <td className="px-2 py-2">{num(summary.averageRackToStationDistance)}</td>
                    <td className="px-2 py-2">{num(summary.p90RackToStationDistance)}</td>
                    <td className="px-2 py-2">{num(summary.congestionRiskScore)}</td>
                    <td className="px-2 py-2">{num(summary.orientationPenaltyScore)}</td>
                    <td className="px-2 py-2 font-semibold">{num(summary.overallLayoutScore)}</td>
                    <td className={`px-2 py-2 font-semibold ${summary.validationErrorCount > 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {summary.validationErrorCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-l border-border bg-slate-50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Compare Top 3</div>
          <div className="grid gap-2">
            {top3.map((summary, index) => (
              <div key={summary.candidateId} className="rounded-md border border-border bg-white p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">#{index + 1} {summary.candidateId}</span>
                  <span className="font-semibold text-teal-700">{num(summary.overallLayoutScore)}</span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                  <span>{summary.layoutFamily}</span>
                  <span>{summary.rackCount} racks</span>
                  <span>Density {pct(summary.storageDensity)}</span>
                  <span>Avg {num(summary.averageRackToStationDistance)} m</span>
                  <span>P90 {num(summary.p90RackToStationDistance)} m</span>
                  <span>Errors {summary.validationErrorCount}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

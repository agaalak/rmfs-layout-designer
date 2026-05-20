import type { WarehouseLayout } from "../models/layout";
import { exportLayoutJson } from "./exportLayout";
import { importLayoutJson } from "./importLayout";

const INDEX_KEY = "rmfs.layoutDesigner.savedLayouts.v1";
const DEFAULT_KEY = "rmfs.layoutDesigner.defaultLayoutId.v1";
const LAYOUT_PREFIX = "rmfs.layoutDesigner.layout.";

export interface SavedLayoutSummary {
  id: string;
  name: string;
  savedAt: string;
  rows: number;
  columns: number;
  rackCount: number;
  stationCount: number;
  schemaVersion?: string;
}

function storage(): Storage | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function keyFor(id: string) {
  return `${LAYOUT_PREFIX}${id}`;
}

function readIndex(): SavedLayoutSummary[] {
  const store = storage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(INDEX_KEY) ?? "[]") as SavedLayoutSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(index: SavedLayoutSummary[]) {
  const store = storage();
  if (!store) return;
  store.setItem(INDEX_KEY, JSON.stringify(index));
}

function summaryFor(layout: WarehouseLayout, savedAt: string): SavedLayoutSummary {
  return {
    id: layout.layoutId,
    name: layout.name,
    savedAt,
    rows: layout.grid.rows,
    columns: layout.grid.columns,
    rackCount: layout.racks.length,
    stationCount: layout.stations.length,
    schemaVersion: layout.layoutSchemaVersion
  };
}

export function listSavedLayouts(): SavedLayoutSummary[] {
  return readIndex().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function getDefaultLayoutId(): string | undefined {
  return storage()?.getItem(DEFAULT_KEY) ?? undefined;
}

export function setDefaultLayoutId(layoutId: string) {
  storage()?.setItem(DEFAULT_KEY, layoutId);
}

export function clearDefaultLayoutId() {
  storage()?.removeItem(DEFAULT_KEY);
}

export function saveLayoutToBrowser(layout: WarehouseLayout, makeDefault = false): SavedLayoutSummary {
  const store = storage();
  if (!store) throw new Error("Browser storage is not available for saving layouts.");
  const savedAt = new Date().toISOString();
  const json = exportLayoutJson({
    ...layout,
    metadata: {
      ...layout.metadata,
      savedInBrowserAt: savedAt
    }
  });
  const summary = summaryFor(layout, savedAt);
  store.setItem(keyFor(summary.id), json);
  const index = readIndex().filter((item) => item.id !== summary.id);
  writeIndex([summary, ...index]);
  if (makeDefault) setDefaultLayoutId(summary.id);
  return summary;
}

export function loadSavedLayout(layoutId: string): WarehouseLayout | undefined {
  const raw = storage()?.getItem(keyFor(layoutId));
  return raw ? importLayoutJson(raw) : undefined;
}

export function deleteSavedLayout(layoutId: string) {
  const store = storage();
  if (!store) return;
  store.removeItem(keyFor(layoutId));
  writeIndex(readIndex().filter((item) => item.id !== layoutId));
  if (getDefaultLayoutId() === layoutId) clearDefaultLayoutId();
}

export function loadDefaultSavedLayout(): WarehouseLayout | undefined {
  const defaultId = getDefaultLayoutId();
  return defaultId ? loadSavedLayout(defaultId) : undefined;
}

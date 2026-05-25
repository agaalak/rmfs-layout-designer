import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

async function appState(page: Page) {
  return page.evaluate(() => {
    const api = (window as unknown as { __RMFS_TEST__: any }).__RMFS_TEST__;
    const layoutState = api.layout.getState();
    const layout = layoutState.history.present;
    const simulation = api.simulation.getState();
    return {
      appMode: api.ui.getState().appMode,
      activeTool: api.ui.getState().activeTool,
      layoutName: layout.name,
      mode: layout.mode,
      rows: layout.grid.rows,
      columns: layout.grid.columns,
      cells: layout.cells.length,
      roads: layout.cells.filter((cell) => cell.cellType === "ROAD").length,
      blocked: layout.cells.filter((cell) => cell.cellType === "BLOCKED").length,
      racks: layout.racks.length,
      stations: layout.stations.length,
      chargers: layout.chargingSpots.length,
      parking: layout.parkingSpots.length,
      rotations: layout.cells.filter((cell) => cell.allowRotation).length,
      selectedKind: layoutState.selected[0]?.kind,
      selectedId: layoutState.selected[0]?.id,
      selectedCell: layoutState.selectedCell,
      candidateCount: layoutState.candidateComparison?.summaries.length ?? 0,
      candidatePreview: Boolean(layout.metadata.candidatePreview),
      appliedCandidateId: layout.metadata.appliedCandidateId,
      firstRackId: layout.racks[0]?.rackId,
      firstRackCell: layout.racks[0]?.homeCell,
      firstRackOrientation: layout.racks[0]?.currentOrientationDeg,
      firstRackLocked: layout.racks[0]?.locked,
      lockedBlockedCellStillPresent: layout.cells.some((cell) => cell.row === 4 && cell.col === 4 && cell.cellType === "BLOCKED" && cell.locked),
      validationIssueCount: layoutState.history.present ? 0 : 0,
      simInitialized: simulation.state.initialized,
      simTasks: simulation.state.tasks.length,
      simCompleted: simulation.state.completedTasks.length,
      simEvents: simulation.state.eventLog.length,
      simOrders: simulation.state.orders.length + simulation.state.completedOrders.length + simulation.state.failedOrders.length,
      simCompletedOrders: simulation.state.completedOrders.length,
      simInventoryBins: simulation.state.inventory.length,
      simInventoryTotal: simulation.state.inventory.reduce((sum: number, bin: any) => sum + bin.quantity, 0),
      simControllerEvents: simulation.state.eventLog.filter((event: any) => event.entityType === "controller").length,
      runtimeCollisionPreventions: simulation.state.trafficDiagnostics.runtimeCollisionPreventionCount
    };
  });
}

async function clickCanvas(page: Page, xRatio: number, yRatio: number) {
  const box = await page.getByTestId("layout-canvas").boundingBox();
  if (!box) throw new Error("Canvas bounding box unavailable");
  await page.mouse.click(box.x + box.width * xRatio, box.y + box.height * yRatio);
}

async function canvasViewState(page: Page) {
  return page.getByTestId("layout-canvas").evaluate((element) => ({
    zoom: Number((element as HTMLElement).dataset.zoom),
    stageX: Number((element as HTMLElement).dataset.stageX),
    stageY: Number((element as HTMLElement).dataset.stageY)
  }));
}

async function newManualLayout(page: Page) {
  await page.getByRole("button", { name: "New layout" }).click();
  await page.getByRole("button", { name: "Create empty Mode A layout" }).click();
  await expect(page.getByTestId("status-bar")).toContainText("Workflow: design");
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await expect(page).toHaveTitle("RMFS Layout Designer");
  await expect(page.getByTestId("layout-canvas")).toBeVisible();
});

test("app loads with demo canvas and no console errors", async ({ page }) => {
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleProblems.push(message.text());
  });
  await expect(page.getByText("RMFS Layout Designer")).toBeVisible();
  await expect(page.getByTestId("status-bar")).toContainText("Tool: select");
  await expect(page.getByRole("button", { name: "Start empty Mode A layout" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate workflow/ })).toBeVisible();
  const state = await appState(page);
  expect(state.racks).toBeGreaterThan(0);
  expect(state.stations).toBeGreaterThan(0);
  expect(state.rows).toBeLessThanOrEqual(24);
  expect(state.columns).toBeLessThanOrEqual(32);
  expect(consoleProblems).toEqual([]);
});

test("creates a manual layout and places core RMFS objects from toolbox clicks", async ({ page }) => {
  await newManualLayout(page);

  await page.getByRole("button", { name: "Draw road / aisle" }).click();
  await clickCanvas(page, 0.32, 0.28);
  await clickCanvas(page, 0.34, 0.28);

  await page.getByRole("button", { name: "Draw rack storage" }).click();
  await clickCanvas(page, 0.36, 0.32);

  await page.getByRole("button", { name: "Add rack / pod" }).click();
  await clickCanvas(page, 0.38, 0.32);

  await page.getByRole("button", { name: "Add station" }).click();
  await clickCanvas(page, 0.44, 0.32);

  await page.getByRole("button", { name: "Add queue lane" }).click();
  await clickCanvas(page, 0.44, 0.28);

  await page.getByRole("button", { name: "Add charging spot" }).click();
  await clickCanvas(page, 0.50, 0.32);

  await page.getByRole("button", { name: "Add parking spot" }).click();
  await clickCanvas(page, 0.54, 0.32);

  await page.getByRole("button", { name: "Traffic direction tool" }).click();
  await clickCanvas(page, 0.58, 0.32);
  await page.getByLabel("Allow rack rotation on this cell").check();

  await page.getByRole("button", { name: "Blocked / wall / column" }).click();
  await clickCanvas(page, 0.62, 0.32);

  const state = await appState(page);
  expect(state.roads).toBeGreaterThan(0);
  expect(state.racks).toBe(1);
  expect(state.stations).toBe(1);
  expect(state.chargers).toBe(1);
  expect(state.parking).toBe(1);
  expect(state.rotations).toBe(1);
  expect(state.blocked).toBeGreaterThan(0);
});

test("selects, moves, rotates, edits, deletes, and undo/redoes a rack", async ({ page }) => {
  await newManualLayout(page);
  await page.getByRole("button", { name: "Add rack / pod" }).click();
  await clickCanvas(page, 0.38, 0.32);
  await page.getByRole("button", { name: "Select / grab / move" }).click();
  await clickCanvas(page, 0.38, 0.32);
  await expect(page.getByLabel("Rack ID")).toBeVisible();

  const beforeMove = (await appState(page)).firstRackCell;
  await page.getByLabel("Home col").fill(String((beforeMove?.col ?? 1) + 1));
  expect((await appState(page)).firstRackCell?.col).toBe((beforeMove?.col ?? 1) + 1);

  await page.getByRole("button", { name: "Rotate selected" }).click();
  expect((await appState(page)).firstRackOrientation).toBe(90);

  await page.getByLabel("Rack ID").fill("rack_ui_qa");
  expect((await appState(page)).firstRackId).toBe("rack_ui_qa");

  await page.keyboard.press("Delete");
  expect((await appState(page)).racks).toBe(0);
  await page.getByRole("button", { name: "Undo" }).click();
  expect((await appState(page)).racks).toBe(1);
  await page.getByRole("button", { name: "Redo" }).click();
  expect((await appState(page)).racks).toBe(0);
});

test("runs validation and analytics after an intentional bad layout change", async ({ page }) => {
  await newManualLayout(page);
  await page.evaluate(() => {
    const store = (window as unknown as { __RMFS_TEST__: any }).__RMFS_TEST__.layout.getState();
    store.addRack({ row: 5, col: 5 });
    store.addRack({ row: 6, col: 6 });
    const layout = (window as unknown as { __RMFS_TEST__: any }).__RMFS_TEST__.layout.getState().history.present;
    store.updateRack(layout.racks[1].id, { homeCell: layout.racks[0].homeCell });
  });
  await page.getByRole("button", { name: /Analyze workflow/ }).click();
  await page.getByRole("banner").getByRole("button", { name: "Run validation" }).click();
  await expect(page.getByTestId("status-bar")).toContainText("Validation errors");
  await expect(page.getByText("Object overlap")).toBeVisible();
  await page.getByRole("banner").getByRole("button", { name: "Run analytics" }).click();
  await expect(page.getByText("Analytics refreshed")).toBeVisible();
});

test("exports and imports layout JSON without losing core objects", async ({ page }) => {
  await newManualLayout(page);
  await page.evaluate(() => {
    const store = (window as unknown as { __RMFS_TEST__: any }).__RMFS_TEST__.layout.getState();
    store.drawCell({ row: 4, col: 4 }, "ROAD");
    store.addRack({ row: 5, col: 5 });
    store.addStation({ row: 5, col: 8 });
    store.addCharger({ row: 5, col: 10 }, 1);
    store.addParking({ row: 5, col: 11 });
    store.addRotation({ row: 5, col: 12 });
  });
  await page.getByRole("button", { name: /Files workflow/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save JSON" }).click();
  const download = await downloadPromise;
  const exported = await download.path();
  if (!exported) throw new Error("Exported layout path unavailable");

  await page.evaluate(() => {
    (window as unknown as { __RMFS_TEST__: any }).__RMFS_TEST__.layout.getState().newLayout({ rows: 8, columns: 8 });
  });
  await expect.poll(async () => (await appState(page)).racks).toBe(0);
  await page.locator('input[type="file"]').first().setInputFiles(exported);
  await expect.poll(async () => (await appState(page)).racks).toBe(1);
  const imported = await appState(page);
  expect(imported.stations).toBe(1);
  expect(imported.chargers).toBe(1);
  expect(imported.parking).toBe(1);
  expect(imported.rotations).toBe(1);

  const invalidPath = path.join(os.tmpdir(), `rmfs-invalid-${Date.now()}.json`);
  await writeFile(invalidPath, "{bad json", "utf-8");
  await page.locator('input[type="file"]').first().setInputFiles(invalidPath);
  await expect(page.getByTestId("status-bar")).toContainText("Invalid JSON");
});

test("saves a browser layout and makes it the startup default", async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("layout-canvas")).toBeVisible();
  await page.evaluate(() => {
    const store = (window as unknown as { __RMFS_TEST__: any }).__RMFS_TEST__.layout.getState();
    store.newLayout({ rows: 9, columns: 11 });
    store.updateLayoutMeta({ name: "Saved Default Layout" });
    store.addRack({ row: 2, col: 2 });
    store.addStation({ row: 2, col: 6 });
  });

  await page.getByRole("button", { name: /Files workflow/ }).click();
  await page.getByRole("button", { name: "Save and make default" }).click();
  await expect(page.getByTestId("status-bar")).toContainText("set it as the startup default");
  await expect(page.getByText("Saved Default Layout").first()).toBeVisible();
  await expect(page.getByText("Default").first()).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("layout-canvas")).toBeVisible();
  const state = await appState(page);
  expect(state.layoutName).toBe("Saved Default Layout");
  expect(state.rows).toBe(9);
  expect(state.columns).toBe(11);
  expect(state.racks).toBe(1);
  expect(state.stations).toBe(1);
  await page.evaluate(() => localStorage.clear());
});

test("generates Mode B candidates, previews, applies, and keeps layout editable", async ({ page }) => {
  await page.getByRole("button", { name: /Generate workflow/ }).click();
  await page.getByRole("button", { name: "Generate Mode B", exact: true }).click();
  await page.getByRole("button", { name: "Generate layout" }).click();
  await expect(page.getByTestId("candidate-drawer")).toBeVisible();
  expect((await appState(page)).candidateCount).toBeGreaterThan(1);

  await page.getByTestId("candidate-drawer").getByRole("button", { name: "Apply Selected Candidate" }).click();
  await expect(page.getByTestId("candidate-drawer")).toBeHidden();
  expect((await appState(page)).appliedCandidateId).toBeTruthy();

  const originalRackId = (await appState(page)).firstRackId;
  await page.evaluate(() => {
    const api = (window as unknown as { __RMFS_TEST__: any }).__RMFS_TEST__;
    const store = api.layout.getState();
    const layout = store.history.present;
    store.updateRack(layout.racks[0].id, { rackId: "rack_after_apply" });
  });
  expect(originalRackId).toBeTruthy();
  expect((await appState(page)).firstRackId).toBe("rack_after_apply");
});

test("hybrid generation preserves a locked blocked constraint", async ({ page }) => {
  await newManualLayout(page);
  await page.evaluate(() => {
    const store = (window as unknown as { __RMFS_TEST__: any }).__RMFS_TEST__.layout.getState();
    store.drawCell({ row: 4, col: 4 }, "BLOCKED");
    store.selectCell({ row: 4, col: 4 });
    store.toggleSelectedLock();
  });
  await page.getByRole("button", { name: /Generate workflow/ }).click();
  await page.getByRole("button", { name: "Generate Hybrid", exact: true }).click();
  await page.getByRole("button", { name: "Fill hybrid layout" }).click();
  await expect.poll(async () => (await appState(page)).lockedBlockedCellStillPresent).toBe(true);
  expect((await appState(page)).racks).toBeGreaterThan(0);
});

test("experimental simulation can complete one simple task cycle", async ({ page }) => {
  await page.getByRole("button", { name: /Simulate workflow/ }).click();
  await expect(page.getByText("2D time-based playback")).toBeVisible();
  await expect(page.getByText(/Not full MAPF/).first()).toBeVisible();
  await page.evaluate(() => {
    const api = (window as unknown as { __RMFS_TEST__: any }).__RMFS_TEST__;
    api.simulation.getState().setConfig({ taskCount: 1 });
  });
  await page.getByRole("button", { name: "Initialize" }).click();
  await page.getByRole("button", { name: "Generate tasks" }).click();
  expect((await appState(page)).simInitialized).toBe(true);
  expect((await appState(page)).simTasks).toBeGreaterThan(0);
  expect((await appState(page)).simOrders).toBeGreaterThan(0);
  expect((await appState(page)).simControllerEvents).toBeGreaterThan(0);
  const inventoryBefore = (await appState(page)).simInventoryTotal;

  const completed = await page.evaluate(() => {
    const api = (window as unknown as { __RMFS_TEST__: any }).__RMFS_TEST__;
    const layout = api.layout.getState().history.present;
    for (let i = 0; i < 240; i += 1) {
      api.simulation.getState().step(layout, 1);
      if (api.simulation.getState().state.completedTasks.length > 0) break;
    }
    return {
      completed: api.simulation.getState().state.completedTasks.length,
      events: api.simulation.getState().state.eventLog.length
    };
  });
  expect(completed.completed).toBeGreaterThan(0);
  expect(completed.events).toBeGreaterThan(0);
  expect((await appState(page)).simCompletedOrders).toBeGreaterThan(0);
  expect((await appState(page)).simInventoryTotal).toBeLessThan(inventoryBefore);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  expect((await appState(page)).simInitialized).toBe(false);
});

test("manual layout can populate inventory and generate sample orders", async ({ page }) => {
  await newManualLayout(page);
  await page.evaluate(() => {
    const api = (window as unknown as { __RMFS_TEST__: any }).__RMFS_TEST__;
    api.layout.getState().addRack({ row: 3, col: 3 });
  });
  await page.getByRole("button", { name: /Simulate workflow/ }).click();
  await page.getByRole("button", { name: "Populate Inventory" }).click();
  await page.getByRole("button", { name: "Generate Orders" }).click();
  await expect.poll(async () => (await appState(page)).simOrders).toBeGreaterThan(0);
  await expect.poll(async () => (await appState(page)).simInventoryBins).toBeGreaterThan(0);
});

test("canvas view controls stay visible across workflows", async ({ page }) => {
  for (const name of [/Design workflow/, /Generate workflow/, /Analyze workflow/, /Simulate workflow/, /Files workflow/]) {
    await page.getByRole("button", { name }).click();
    await expect(page.getByTestId("canvas-view-controls")).toBeVisible();
    await expect(page.getByTestId("canvas-view-controls").getByRole("button", { name: "Fit to screen" })).toBeVisible();
    await expect(page.getByTestId("canvas-view-controls").getByRole("button", { name: "Toggle grid" })).toBeVisible();
  }
});

test("mouse wheel zoom and mouse drag pan update canvas view state", async ({ page }) => {
  const box = await page.getByTestId("layout-canvas").boundingBox();
  if (!box) throw new Error("Canvas bounding box unavailable");
  const before = await canvasViewState(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -500);
  await expect.poll(async () => (await canvasViewState(page)).zoom).not.toBe(before.zoom);

  const afterZoom = await canvasViewState(page);
  await page.keyboard.down("Space");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect.poll(async () => {
    const current = await canvasViewState(page);
    return Math.abs(current.stageX - afterZoom.stageX) + Math.abs(current.stageY - afterZoom.stageY);
  }).toBeGreaterThan(1);
});

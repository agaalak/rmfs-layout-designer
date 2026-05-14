import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/?debug=true");
  await expect(page).toHaveTitle("RMFS Layout Designer");
  await expect(page.getByTestId("layout-canvas")).toBeVisible();
});

test("debug panel opens with keyboard shortcut and captures console warnings", async ({ page }) => {
  await page.keyboard.press("Control+Shift+D");
  await expect(page.getByTestId("debug-panel")).toBeVisible();
  await page.evaluate(() => console.warn("QA_TEST_WARNING_FROM_E2E"));
  await expect(page.getByText("QA_TEST_WARNING_FROM_E2E")).toBeVisible();
  const diagnostics = await page.evaluate(() => window.__RMFS_DEBUG__?.getCurrentDiagnostics());
  expect(diagnostics?.debug.events.length).toBeGreaterThan(0);
});

test("debug diagnostics records user actions and simulation events", async ({ page }) => {
  await page.getByRole("button", { name: /Generate workflow/ }).click();
  await page.getByRole("button", { name: /Simulate workflow/ }).click();
  await page.getByRole("button", { name: "Initialize" }).click();
  await page.getByRole("button", { name: "Generate tasks" }).click();
  await page.keyboard.press("Control+Shift+D");
  await expect(page.getByTestId("debug-panel")).toBeVisible();
  await expect(page.getByText("Workflow changed to generate")).toBeVisible();
  await expect.poll(async () => page.getByText(/Rack .* selected for SKU/).count()).toBeGreaterThan(0);
  const snapshot = await page.evaluate(() => ({
    actions: window.__RMFS_DEBUG__?.getRecentActions().length ?? 0,
    simulationEvents: window.__RMFS_DEBUG__?.getCurrentDiagnostics().debug.events.filter((event: { category: string }) => event.category === "simulation" || event.category === "controller").length ?? 0
  }));
  expect(snapshot.actions).toBeGreaterThan(0);
  expect(snapshot.simulationEvents).toBeGreaterThan(0);
});

test("issue reporter downloads a JSON report", async ({ page }) => {
  await page.keyboard.press("Control+Shift+D");
  await expect(page.getByTestId("debug-panel")).toBeVisible();
  await page.getByLabel("Issue title").fill("E2E issue report");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export issue JSON + Markdown" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/issue-report-.*\.(json|md)/);
});

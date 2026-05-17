import { expect, test } from "@playwright/test";

test.use({ trace: "off", video: "off", screenshot: "off" });

test("app loads with Experimental Simulation workflow available", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Primary workflows")).toBeVisible();
  await expect(page.getByRole("button", { name: /Simulate workflow, Experimental/i })).toBeVisible();
  await expect(page.getByText(/RMFS Layout Designer/i)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("debug traffic gate prevents duplicate robot cell ownership in default layout", async ({ page }) => {
  await page.goto("/?debug=true", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as any).__RMFS_TEST__?.simulation));

  const result = await page.evaluate(() => {
    const testApi = (window as any).__RMFS_TEST__;
    const layoutStore = testApi.layout.getState();
    const simulationStore = testApi.simulation.getState();
    const layout = layoutStore.history.present;
    simulationStore.setConfig({
      robotCount: 4,
      taskCount: 6,
      collisionCheckingEnabled: true,
      deadlockDetectionEnabled: false,
      stationAssignmentStrategy: "shortest_queue",
      unloadedSpeedMps: 1.5,
      loadedSpeedMps: 1.2
    });
    simulationStore.initialize(layout);
    testApi.simulation.getState().generateTasks(layout);
    for (let index = 0; index < 200; index += 1) {
      testApi.simulation.getState().step(layout, 0.2);
    }
    const state = testApi.simulation.getState().state;
    const duplicateClaims = new Map<string, string[]>();
    for (const robot of state.robots) {
      for (const cell of [robot.currentCell, robot.targetCell].filter(Boolean)) {
        const key = `${cell.row}:${cell.col}`;
        duplicateClaims.set(key, [...(duplicateClaims.get(key) ?? []), robot.robotId]);
      }
    }
    const duplicates = [...duplicateClaims.entries()].filter(([, robots]) => robots.length > 1);
    return {
      duplicates,
      deniedMoves: testApi.getDeniedMoves?.() ?? [],
      occupancy: testApi.getTrafficOccupancy?.() ?? [],
      activeRobots: state.robots.filter((robot) => !["IDLE", "PARKING", "CHARGING"].includes(robot.state)).length,
      debugHookPresent: Boolean((window as any).__RMFS_DEBUG__?.getTrafficOccupancy)
    };
  });

  expect(result.debugHookPresent).toBe(true);
  expect(result.duplicates).toEqual([]);
  expect(result.occupancy.length).toBeGreaterThan(0);
});

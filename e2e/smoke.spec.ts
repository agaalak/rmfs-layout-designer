import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("RMFS Layout Designer");
});

test("@smoke app loads with the workflow rail and canvas", async ({ page }) => {
  await expect(page.getByText("RMFS Layout Designer")).toBeVisible();
  await expect(page.getByRole("button", { name: /Design workflow/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate workflow/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Analyze workflow/ })).toBeVisible();
  await expect(page.getByTestId("layout-canvas")).toBeVisible();
});

test("@smoke workflow navigation exposes contextual panels", async ({ page }) => {
  await page.getByRole("button", { name: /Generate workflow/ }).click();
  await expect(page.getByText("Procedural and hybrid layouts")).toBeVisible();
  await page.getByRole("button", { name: /Analyze workflow/ }).click();
  await expect(page.getByRole("tab", { name: "Validation" })).toBeVisible();
  await page.getByRole("button", { name: /Files workflow/ }).click();
  await expect(page.getByText("Import, export, and reports")).toBeVisible();
});

test("@smoke small viewport uses responsive drawers", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });
  await expect(page.getByText(/For best layout editing/)).toBeVisible();
  await page.getByRole("button", { name: "Open Design tools" }).click();
  await expect(page.getByRole("dialog", { name: "Design tools drawer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add rack / pod" })).toBeVisible();
  await page.getByRole("button", { name: "Close responsive drawer" }).click();
  await page.getByRole("button", { name: "Open design panel" }).click();
  await expect(page.getByRole("dialog", { name: "design workflow drawer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start empty Mode A layout" })).toBeVisible();
});

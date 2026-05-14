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

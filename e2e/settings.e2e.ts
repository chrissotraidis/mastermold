import { expect, test } from "./app-test";

test("Settings: status values and the Monarch header are not squeezed", async ({ page }) => {
  await page.goto("/settings");
  const clipped = await page.getByRole("region", { name: "Status overview" }).locator("p.truncate").evaluateAll((els) =>
    els.filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent),
  );
  expect(clipped).toEqual([]);
  const title = await page.locator("#monarch-mcp-title").boundingBox();
  const button = await page.getByRole("button", { name: /Test Monarch connection/ }).boundingBox();
  const overlaps = button!.x < title!.x + title!.width && button!.y < title!.y + title!.height && button!.y + button!.height > title!.y;
  expect(overlaps).toBe(false);
});

test("Settings: connection forms stay folded unless a command routes to them", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Test read-only access" })).toBeHidden();
  await page.goto("/settings?action=test-portfolio-connection");
  await expect(page.getByRole("button", { name: "Test read-only access" }).first()).toBeVisible();
});

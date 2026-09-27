import { expect, test } from "@playwright/test";
import { importCsv, resetMoney, threeMonthsCsv } from "./helpers";

test.describe("Phone layout", () => {
  test.beforeEach(async ({ request }) => {
    await resetMoney(request);
    await importCsv(request, threeMonthsCsv().csv);
  });

  for (const path of ["/transactions", "/budget", "/portfolio"]) {
    test(`${path} has no sideways scroll and taps work`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      if (path === "/budget") {
        await page.getByRole("button", { name: "Start from my spending" }).tap();
        await expect(page.getByTestId("budget-group-flex")).toContainText("Groceries");
        await expect(page.getByTestId("budget-group-flex").getByText("Groceries", { exact: true })).toBeVisible();
      } else if (path === "/portfolio") {
        await page.getByRole("radio", { name: "1M" }).or(page.getByRole("button", { name: "1M" })).first().tap();
        await expect(page.getByTestId("range-change").or(page.getByText("Not enough history in this range")).first()).toBeVisible();
      } else {
        await page.getByRole("button", { name: "Import CSV", exact: true }).tap();
        await expect(page.getByRole("dialog").getByRole("heading", { name: "Import transactions" })).toBeVisible();
      }
    });
  }
});

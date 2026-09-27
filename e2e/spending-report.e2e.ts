import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { importCsv, resetMoney } from "./helpers";

test.describe("Spending report click-through", () => {
  test.beforeEach(async ({ request }) => {
    await resetMoney(request);
    await importCsv(request, readFileSync(join(process.cwd(), "e2e", "fixtures", "bank.csv"), "utf8"));
  });

  test("group by merchant, tap one to filter the list, tap again to clear", async ({ page }) => {
    await page.goto("/transactions");
    const list = page.getByTestId("transaction-list").locator("li");
    await expect(list).toHaveCount(6);
    const panel = page.getByRole("region", { name: "Spending" }).or(page.locator('[aria-labelledby="spend-title"]'));
    await panel.getByRole("radio", { name: "Merchant" }).or(panel.getByRole("button", { name: "Merchant" })).first().click();
    const row = panel.getByRole("button", { name: /Whole Foods/ });
    await expect(row).toContainText("$120.40");
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect(list).toHaveCount(1);
    await row.click();
    await expect(list).toHaveCount(6);
  });
});

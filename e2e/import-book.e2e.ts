import { expect, test } from "./app-test";

// Same shape as the manual_holdings book from the old server; made-up values.
const book = {
  manual_holdings: [
    { id: "manual_aaa_1", symbol: "AAA", asset_name: "Sample Equity A", asset_class: "equity", venue: "Robinhood", quantity: 5, price: 100, cost_basis: 400, daily_change_pct: 0, created_at: "2026-07-10T17:14:00.000Z", updated_at: "2026-07-10T17:14:00.000Z" },
    { id: "manual_bbb_2", symbol: "BBB", asset_name: "Sample Coin B", asset_class: "crypto", venue: "Coinbase", quantity: 2, price: 50, cost_basis: 100, daily_change_pct: 0, created_at: "2026-07-10T17:14:01.000Z", updated_at: "2026-07-10T17:14:01.000Z" },
  ],
};

test("import a manual_holdings book, see it, and undo it", async ({ page }) => {
  await page.goto("/portfolio");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Holdings to import").fill(JSON.stringify(book));
  const save = dialog.getByRole("button", { name: "Save 2 holdings" });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Import saved")).toBeVisible();
  await expect(page.getByRole("row", { name: /AAA/ })).toContainText("$500");
  await expect(page.getByRole("row", { name: /BBB/ })).toContainText("$100");
  await expect(page.getByText("You’re looking at sample data.")).toHaveCount(0);
  await expect(page.getByText(/Add holdings on Portfolio/)).toHaveCount(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("row", { name: /AAA/ })).toHaveCount(0);
  await expect(page.getByText("You’re looking at sample data.")).toBeVisible();
});

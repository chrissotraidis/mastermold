import { expect, test } from "./app-test";
import { join } from "node:path";
import { ORIGIN, resetMoney } from "./helpers";

const headers = { "content-type": "application/json", origin: ORIGIN };

test.describe("Bank CSV formats (made-up samples)", () => {
  test.beforeEach(async ({ request }) => resetMoney(request));

  test("an Amex sample is recognized, flipped, and imports as spending", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Import CSV", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("No file handy? Load a made-up sample:").selectOption({ label: "American Express" });
    await expect(dialog.getByTestId("import-format")).toContainText("Recognized: American Express");
    await expect(dialog.getByLabel(/Purchases show as positive/)).toBeChecked();
    await expect(dialog.getByTestId("import-preview")).toContainText("3 new");
    await dialog.getByRole("button", { name: /^Import 3$/ }).click();
    await expect(page.getByText("Imported 3 transactions")).toBeVisible();
    // Airline + hotel; the card payment is a transfer and stays out of spending.
    await expect(page.getByTestId("cash-flow")).toContainText("$501.60");
  });

  test("a Monarch export keeps merchants, categories and matching accounts", async ({ page, request }) => {
    const account = await (await request.post("/api/money/accounts", { headers, data: { name: "Sample Card", type: "credit_card" } })).json();
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Import CSV", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').setInputFiles(join(process.cwd(), "public", "samples", "monarch.csv"));
    await expect(dialog.getByTestId("import-format")).toContainText("Recognized: Monarch export");
    await expect(dialog.getByTestId("import-format")).toContainText("4 rows keep their category");
    await expect(dialog.getByText("No account named Sample Checking yet")).toBeVisible();
    await dialog.getByRole("button", { name: /^Import 4$/ }).click();
    await expect(page.getByText("Imported 4 transactions")).toBeVisible();
    const rows = (await (await request.get("/api/transactions")).json()).transactions as Array<Record<string, unknown>>;
    expect(rows.find((row) => row.merchant === "Sample Pharmacy")).toMatchObject({ category_id: "pharmacy", notes: "refill", account_id: account.account.id });
    await request.delete(`/api/money/accounts/${account.account.id}`, { headers });
  });
});

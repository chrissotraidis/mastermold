import { expect, test } from "./app-test";
import { join } from "node:path";
import { importCsv, resetMoney } from "./helpers";

const BANK_CSV = join(process.cwd(), "e2e", "fixtures", "bank.csv");

test.describe("Transactions, end to end with real clicks", () => {
  test.beforeEach(async ({ request }) => resetMoney(request));

  test("import a CSV file, preview, import, and see cash flow", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page.getByText("No transactions yet")).toBeVisible();

    await page.getByRole("button", { name: "Import CSV", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Import transactions" })).toBeVisible();
    await dialog.locator('input[type="file"]').setInputFiles(BANK_CSV);
    await expect(dialog.getByTestId("import-preview")).toContainText("6 new");
    await dialog.getByRole("button", { name: /^Import 6$/ }).click();

    await expect(page.getByText("Imported 6 transactions")).toBeVisible();
    const flow = page.getByTestId("cash-flow");
    await expect(flow).toContainText("$5,000");
    // Coffee + groceries + Netflix + gas; the $1,000 transfer is excluded.
    await expect(flow).toContainText("$191.09");
    await expect(page.getByTestId("transaction-list").locator("li")).toHaveCount(6);
  });

  test("importing the same file twice finds only duplicates", async ({ page, request }) => {
    const fs = await import("node:fs");
    await importCsv(request, fs.readFileSync(BANK_CSV, "utf8"));
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Import CSV", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').setInputFiles(BANK_CSV);
    await expect(dialog.getByTestId("import-preview")).toContainText("0 new · 6 already imported");
    await expect(dialog.getByRole("button", { name: /^Import/ })).toBeDisabled();
  });

  test("undo from the toast removes the whole import", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Import CSV", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Or paste it").fill("Date,Description,Amount\n2026-09-20,CORNER DELI,-12.00\n2026-09-21,CORNER DELI,-9.50\n");
    await dialog.getByRole("button", { name: "Preview" }).click();
    await dialog.getByRole("button", { name: /^Import 2$/ }).click();
    await expect(page.getByTestId("transaction-list").locator("li")).toHaveCount(2);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("No transactions yet")).toBeVisible();
  });

  test("recategorize inline, hide, delete, and it all survives a reload", async ({ page, request }) => {
    const fs = await import("node:fs");
    await importCsv(request, fs.readFileSync(BANK_CSV, "utf8"));
    await page.goto("/transactions");

    await page.getByLabel("Category for Shell Oil").selectOption("parking");
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: "Edit Blue Bottle Coffee" }).click();
    await dialog.getByRole("button", { name: "Hide from totals" }).click();
    await expect(page.getByTestId("cash-flow")).toContainText("$184.59");
    await page.getByRole("button", { name: "Edit Netflix.com" }).click();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Transaction deleted")).toBeVisible();
    // Rename and add a note from the sheet.
    await page.getByRole("button", { name: "Edit Whole Foods Market" }).click();
    await dialog.getByLabel("Name").fill("Whole Foods");
    await dialog.getByLabel("Notes").fill("weekly shop");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Edit Whole Foods", exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Category for Shell Oil")).toHaveValue("parking");
    await page.getByRole("button", { name: "Edit Blue Bottle Coffee" }).click();
    await expect(dialog.getByRole("button", { name: "Show in totals" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Netflix.com")).toHaveCount(0);
    await expect(page.getByTestId("cash-flow")).toContainText("$168.60");
  });

  test("make a rule from a row, preview it, and apply it to the past", async ({ page, request }) => {
    const fs = await import("node:fs");
    await importCsv(request, fs.readFileSync(BANK_CSV, "utf8"));
    await page.goto("/transactions");
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: "Edit Netflix.com" }).click();
    await dialog.getByRole("button", { name: "Make a rule" }).click();
    await dialog.getByLabel("When the merchant contains").fill("netflix");
    await dialog.getByLabel("Rename it to").fill("Netflix");
    await dialog.getByRole("button", { name: "Preview matches" }).click();
    await expect(dialog.getByRole("button", { name: "1 match now" })).toBeVisible();
    await dialog.getByRole("button", { name: "Save rule" }).click();
    await expect(page.getByText("Applied to 1 past transaction.")).toBeVisible();
    await expect(page.getByText("When merchant contains “netflix”")).toBeVisible();
    await expect(page.getByLabel("Category for Netflix", { exact: true })).toHaveValue("streaming");
  });

  test("add a cash transaction by hand", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Description").fill("Farmers market");
    await dialog.getByLabel("Amount").fill("23.50");
    await dialog.getByLabel("Date").fill("2026-09-14");
    await dialog.getByLabel("Category").selectOption("groceries");
    await dialog.getByRole("button", { name: "Add transaction" }).click();
    await expect(page.getByText("Transaction added")).toBeVisible();
    await expect(page.getByLabel("Category for Farmers market")).toHaveValue("groceries");
  });
});

import { expect, test } from "./app-test";
import { resetMoney } from "./helpers";

test.describe("Sandbox bank sync (made-up data, no network)", () => {
  test.beforeEach(async ({ request }) => resetMoney(request));

  test("sync, re-sync without duplicates, then undo", async ({ page }) => {
    await page.goto("/transactions");
    const open = async () => {
      await page.getByRole("button", { name: "Import CSV", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Run sandbox sync" }).click();
    };

    await open();
    await expect(page.getByText("Sandbox sync: 5 new")).toBeVisible();
    await expect(page.getByText("sandbox", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("SANDBOX DUPLICATE CHARGE")).toHaveCount(0);

    await open();
    await expect(page.getByText("Sandbox sync: 0 new")).toBeVisible();

    const res = await page.request.get("/api/transactions");
    const rows = (await res.json()).transactions as Array<{ source: string }>;
    expect(rows.filter((row) => row.source === "sandbox")).toHaveLength(5);
  });

  test("undo from the toast removes the synced rows", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Import CSV", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Run sandbox sync" }).click();
    await expect(page.getByText("Sandbox sync: 5 new")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("No transactions yet")).toBeVisible();
  });
});

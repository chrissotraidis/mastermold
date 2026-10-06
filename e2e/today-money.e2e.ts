import { expect, test } from "./app-test";
import { ORIGIN, importCsv, resetMoney, threeMonthsCsv } from "./helpers";

const headers = { "content-type": "application/json", origin: ORIGIN };

test.describe("Today money panel (Monarch-style dashboard)", () => {
  test.beforeEach(async ({ request }) => resetMoney(request));

  test("is hidden without transactions", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(page.getByTestId("today-money")).toHaveCount(0);
  });

  test("shows spending against the budget, next bills and latest rows, and links to Budget", async ({ page, request }) => {
    await importCsv(request, threeMonthsCsv().csv);
    await request.post("/api/budget", { headers, data: { action: "apply_suggestions" } });
    await page.goto("/");
    const panel = page.getByTestId("today-money");
    await expect(panel).toContainText("Spent of budget");
    await expect(panel.getByRole("progressbar", { name: "Budget used" })).toBeVisible();
    const bills = panel.getByTestId("today-bills");
    await expect(bills).toContainText("Netflix.com");
    await expect(bills).toContainText("Rent Payment");
    // Groceries repeat every month but are everyday spending, not a bill.
    await expect(bills).not.toContainText("Whole Foods");
    await expect(panel).toContainText("Income $5,000.00");
    await panel.getByRole("link", { name: /Spent of budget/ }).click();
    await page.waitForURL("**/budget");
  });
});

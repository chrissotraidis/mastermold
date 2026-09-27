import { expect, test } from "@playwright/test";
import { importCsv, resetMoney, threeMonthsCsv } from "./helpers";

test.describe("Budget, end to end with real clicks", () => {
  test.beforeEach(async ({ request }) => {
    await resetMoney(request);
    await importCsv(request, threeMonthsCsv().csv);
  });

  test("start from past spending, edit a plan, roll over, remove and re-add", async ({ page }) => {
    await page.goto("/budget");
    await expect(page.getByText("No budget yet")).toBeVisible();
    await expect(page.getByTestId("budget-summary")).toContainText("set a budget first");

    await page.getByRole("button", { name: "Start from my spending" }).click();
    await expect(page.getByText("Budget created from your spending")).toBeVisible();
    const fixed = page.getByTestId("budget-group-fixed");
    const flex = page.getByTestId("budget-group-flex");
    await expect(fixed).toContainText("Rent");
    await expect(fixed).toContainText("Streaming");
    await expect(flex).toContainText("Groceries");
    await expect(flex).toContainText("Restaurants");

    // Groceries averaged $410 → plan $410; this month spent $430.
    const plan = page.getByLabel("Monthly plan for Groceries");
    await expect(plan).toHaveValue("410");
    await plan.fill("500");
    await plan.blur();
    await expect(flex).toContainText("$430.00 of $500.00 · $70.00 left");

    await page.getByRole("button", { name: "Turn on rollover for Restaurants" }).click();
    await expect(flex).toContainText("carried");
    await expect(page.getByRole("button", { name: "Turn off rollover for Restaurants" })).toBeVisible();

    await page.getByRole("button", { name: "Remove Restaurants from the budget" }).click();
    const unbudgeted = page.getByTestId("budget-unbudgeted");
    await expect(unbudgeted).toContainText("Restaurants");
    await unbudgeted.getByRole("button", { name: "Budget it" }).click();
    await expect(flex).toContainText("Restaurants");

    await page.reload();
    await expect(page.getByLabel("Monthly plan for Groceries")).toHaveValue("500");
  });

  test("add a category from the form", async ({ page }) => {
    await page.goto("/budget");
    await page.getByLabel("Category", { exact: true }).selectOption("gifts");
    await page.getByLabel("Group", { exact: true }).selectOption("non_monthly");
    await page.getByLabel("Per month").fill("75");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByTestId("budget-group-non_monthly")).toContainText("Gifts");
    await expect(page.getByTestId("budget-summary")).toContainText("$75.00");
  });
});


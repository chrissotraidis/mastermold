import { expect, test } from "./app-test";
import { importCsv, resetMoney } from "./helpers";

test.describe("Savings goals, end to end with real clicks", () => {
  test.beforeEach(async ({ request }) => {
    await resetMoney(request);
    const today = new Date();
    const day = (offset: number) => new Date(today.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
    await importCsv(request, `Date,Description,Amount\n${day(40)},ONLINE TRANSFER TO SAVINGS,-500.00\n${day(10)},ONLINE TRANSFER TO SAVINGS 2,-750.00\n`);
  });

  test("create a goal, link a transfer, edit it, and delete it", async ({ page }) => {
    await page.goto("/budget#goals");
    const panel = page.getByTestId("goals-panel");
    await expect(panel).toContainText("No goals yet");

    await panel.getByRole("button", { name: "New goal" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Emergency fund");
    await dialog.getByLabel("Target amount").fill("10000");
    await dialog.getByLabel("Already saved").fill("2000");
    await dialog.getByRole("button", { name: "Create goal" }).click();
    await expect(page.getByText("Goal created")).toBeVisible();

    const card = panel.getByTestId("goal-card");
    await expect(card).toContainText("$2,000 of $10,000 · 20%");
    await expect(card).toContainText("No date");

    const candidates = panel.getByTestId("goal-candidates");
    await expect(candidates.locator("li")).toHaveCount(2);
    await candidates.getByRole("combobox").first().selectOption({ label: "Emergency fund" });
    await expect(page.getByText("Linked to goal")).toBeVisible();
    await expect(card).toContainText("% ");
    await expect(candidates.locator("li")).toHaveCount(1);

    await card.getByRole("button", { name: "Edit" }).click();
    await dialog.getByLabel("Target amount").fill("5000");
    await dialog.getByRole("button", { name: "Save goal" }).click();
    await expect(page.getByText("Goal saved")).toBeVisible();
    await expect(card).toContainText(/of \$5,000/);

    await page.reload();
    await expect(page.getByTestId("goal-card")).toContainText(/of \$5,000/);
    await page.getByRole("button", { name: "Delete goal Emergency fund" }).click();
    await expect(page.getByTestId("goals-panel")).toContainText("No goals yet");
  });
});


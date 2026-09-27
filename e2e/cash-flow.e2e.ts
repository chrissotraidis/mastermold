import { expect, test } from "./app-test";
import { importCsv, resetMoney, threeMonthsCsv } from "./helpers";

test.describe("Cash flow bars", () => {
  test.beforeEach(async ({ request }) => {
    await resetMoney(request);
    await importCsv(request, threeMonthsCsv().csv);
  });

  test("one pair of bars per month; tapping last month opens it", async ({ page }) => {
    const { months, current } = threeMonthsCsv();
    await page.goto("/transactions");
    const bars = page.getByTestId("cash-flow-bars").getByRole("button");
    await expect(bars).toHaveCount(months.length + 1);
    await expect(bars.last()).toHaveAttribute("aria-pressed", "true");
    const last = months[months.length - 1];
    const label = new Date(`${last}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    await page.getByRole("button", { name: new RegExp(`^${label}: income`) }).click();
    await expect(bars.nth(months.length - 1)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("transaction-list").locator("li").first()).toContainText(label.slice(0, 3));
    expect(current).not.toBe(last);
  });

  test("merchant names up to 18 characters show in full on desktop (they used to cut to three letters)", async ({ page }) => {
    await page.goto("/transactions");
    const clipped = await page.getByTestId("transaction-list").locator("li .truncate.font-semibold").evaluateAll((els) =>
      els.filter((el) => (el.textContent ?? "").length <= 18 && el.scrollWidth > el.clientWidth).map((el) => el.textContent),
    );
    expect(clipped).toEqual([]);
  });
});

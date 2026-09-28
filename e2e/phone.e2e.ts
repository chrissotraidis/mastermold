import { expect, test } from "./app-test";
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

  test("Budget is reachable from Spending and keeps that tab lit", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByRole("link", { name: "Budget", exact: true }).first().tap();
    await page.waitForURL("**/budget");
    await expect(page.getByRole("navigation", { name: "Mobile primary" }).getByRole("link", { name: "Transactions" })).toHaveAttribute("aria-current", "page");
  });

  test("stat tile labels are not cut off on a phone", async ({ page }) => {
    await page.goto("/portfolio");
    const clipped = await page.getByTestId("money-stats").locator(".mm-eyebrow").evaluateAll((els) =>
      els.filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent),
    );
    expect(clipped).toEqual([]);
    // Header actions fit one row, and panel titles keep room when an action sits beside them.
    const refresh = await page.getByRole("button", { name: "Refresh prices" }).boundingBox();
    const add = await page.getByRole("link", { name: "Add holding" }).boundingBox();
    expect(Math.abs(refresh!.y - add!.y)).toBeLessThan(4);
    const title = await page.getByRole("heading", { name: "Net worth", exact: true }).boundingBox();
    expect(title!.width).toBeGreaterThanOrEqual(150);
  });
});

test.describe("Phone navigation and privacy", () => {
  test("More reaches every page; Labs switches between the two labs", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Mobile primary" });
    for (const [label, path] of [["Budget", "/budget"], ["Polymarket lab", "/polymarket"], ["Settings", "/settings"], ["Journal", "/journal"]]) {
      await nav.getByRole("button", { name: "More" }).tap();
      await page.getByTestId("more-sheet").getByRole("link", { name: new RegExp(`^${label}`) }).tap();
      await page.waitForURL(`**${path}`);
    }
    await nav.getByRole("link", { name: "Research labs" }).tap();
    await page.waitForURL("**/trading");
    await page.getByRole("navigation", { name: "Research labs" }).getByRole("link", { name: "Polymarket" }).tap();
    await page.waitForURL("**/polymarket");
    await expect(nav.getByRole("link", { name: "Research labs" })).toHaveAttribute("aria-current", "page");
  });

  test("Hide amounts blurs figures and survives a reload", async ({ page }) => {
    await page.goto("/portfolio");
    await page.getByRole("button", { name: "Hide amounts" }).tap();
    const blur = () => page.getByTestId("money-stats").locator(".mm-num").first().evaluate((el) => getComputedStyle(el).filter);
    expect(await blur()).toContain("blur");
    await page.reload();
    await page.waitForFunction(() => document.documentElement.classList.contains("mm-private"));
    expect(await blur()).toContain("blur");
    await page.getByRole("button", { name: "Show amounts" }).tap();
    expect(await blur()).toBe("none");
  });
});

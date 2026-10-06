import { expect, test } from "./app-test";

// A first visit: no saved welcome flag.
test.use({ storageState: { cookies: [], origins: [] } });

test("first visit shows Welcome; Look around dismisses it and lands on Today for good", async ({ page }) => {
  await page.goto("/budget");
  await page.waitForURL("**/welcome");
  await page.getByRole("button", { name: "Look around with sample data first" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await page.goto("/budget");
  await expect(page).toHaveURL(/\/budget$/);
});

test("a Welcome step opens its page and does not loop back", async ({ page }) => {
  await page.goto("/welcome");
  await page.getByRole("button", { name: /Add accounts and debts/ }).click();
  await page.waitForURL(/\/portfolio/);
  await page.goto("/");
  await expect(page).not.toHaveURL(/welcome/);
});

import { expect, test } from "./app-test";

test("Web3 lab never calls experiments running while the bot is off", async ({ page }) => {
  await page.goto("/trading");
  await expect(page.getByText("bot not running", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/of \d+ ready/)).toBeVisible();
  await expect(page.getByText(/of \d+ running/)).toHaveCount(0);
});

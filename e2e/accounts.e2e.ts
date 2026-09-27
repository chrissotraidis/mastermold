import { expect, test } from "@playwright/test";
import { ORIGIN } from "./helpers";

const headers = { "content-type": "application/json", origin: ORIGIN };

test("an account left out of net worth stays listed and leaves the total", async ({ page, request }) => {
  const netWorth = async () => (await (await request.get("/api/money")).json()).net_worth as number;
  const before = await netWorth();

  await page.goto("/portfolio");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Parents joint e2e");
  await dialog.getByRole("button", { name: "Bank account", exact: true }).click();
  await dialog.getByLabel("Balance").fill("5000");
  await dialog.getByLabel("Net worth").uncheck();
  await dialog.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText("Account added")).toBeVisible();

  const card = page.getByRole("button", { name: /Parents joint e2e/ });
  await expect(card).toContainText("Not in net worth");
  expect(await netWorth()).toBe(before);

  await card.getByText("Edit", { exact: true }).click();
  await expect(dialog.getByLabel("Net worth")).not.toBeChecked();
  await dialog.getByLabel("Net worth").check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Account updated")).toBeVisible();
  await expect(card).not.toContainText("Not in net worth");
  expect(await netWorth()).toBe(before + 5000);

  const summary = await (await request.get("/api/money")).json();
  const created = summary.accounts.find((account: { name: string }) => account.name === "Parents joint e2e");
  await request.delete(`/api/money/accounts/${created.id}`, { headers });
});

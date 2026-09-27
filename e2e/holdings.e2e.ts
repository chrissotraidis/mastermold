import { expect, test } from "./app-test";

test("add a holding, see its gain, edit with undo, remove with undo", async ({ page }) => {
  await page.goto("/portfolio");
  await page.getByRole("link", { name: "Add holding" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Symbol").fill("VTI");
  await dialog.getByLabel("Amount").fill("10");
  await dialog.getByLabel("Price", { exact: true }).fill("250");
  await dialog.getByLabel(/Cost basis/).fill("2000");
  await dialog.getByRole("button", { name: "Add holding" }).click();
  await expect(page.getByText("VTI added")).toBeVisible();

  const row = page.getByRole("row", { name: /VTI/ });
  await expect(row).toContainText("$2,500");
  await expect(page.getByTestId("total-gain")).toContainText("+$500 (+25.0%)");

  await row.getByRole("button", { name: /^VTI/ }).click();
  await dialog.getByLabel("Amount").fill("12");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(row).toContainText("$3,000");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row).toContainText("$2,500");

  await row.getByRole("button", { name: /^VTI/ }).click();
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("VTI removed")).toBeVisible();
  await expect(page.getByRole("row", { name: /VTI/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("row", { name: /VTI/ })).toHaveCount(1);

  // Leave the shared test store as other specs expect it.
  await page.getByRole("row", { name: /VTI/ }).getByRole("button", { name: /^VTI/ }).click();
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("row", { name: /VTI/ })).toHaveCount(0);
});

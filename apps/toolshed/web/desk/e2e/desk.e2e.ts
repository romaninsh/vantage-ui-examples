import { expect, test } from "@playwright/test";

const rows = (page: import("@playwright/test").Page) => page.locator("tbody tr");

test("lists the tools sorted by name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Toolshed" })).toBeVisible();
  await expect(page.getByText("25 tools")).toBeVisible();
  await expect(rows(page).first().locator("td").first()).toHaveText("Angle grinder");
  await expect(rows(page).last().locator("td").first()).toHaveText("Wheelbarrow");
});

test("the status filter narrows the rows on the server", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("25 tools")).toBeVisible();
  await page.getByLabel("Status").selectOption("repair");
  await expect(page.getByText("2 tools")).toBeVisible();
  await expect(rows(page).locator("td:first-child")).toHaveText(["Circular saw", "Strimmer"]);
  await page.getByLabel("Status").selectOption("on_loan");
  await expect(page.getByText("9 tools")).toBeVisible();
});

test("checking overdue loans shows progress, then the count, and flags the tools", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("25 tools")).toBeVisible();
  await page.getByRole("button", { name: "Check overdue loans" }).click();
  await expect(page.getByLabel("Checking loans")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("3 tools are overdue", { timeout: 15_000 });
  await expect(page.getByText("9 of 9")).toBeVisible();
  await page.getByLabel("Status").selectOption("on_loan");
  await expect(rows(page).filter({ hasText: "Overdue" })).toHaveCount(3);
});

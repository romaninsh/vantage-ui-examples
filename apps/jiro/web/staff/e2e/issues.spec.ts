// The issue list against the live API: distinct rows in the server's order,
// sorting done by the server, and links into issue detail.
import { expect, test, type Page } from "@playwright/test";
import { issueTotal } from "./liveDb";

/** Each rendered row's key link (the summary links to the same page). */
const keyLinks = (page: Page) => page.locator("tbody tr a[href^='/issues/']").filter({ hasText: /^[A-Z]+-\d+$/ });

/** The issue keys of the rows currently rendered, top to bottom. */
async function visibleKeys(page: Page) {
  return keyLinks(page).allInnerTexts();
}

test("lists distinct issues in the server's order", async ({ page }) => {
  await page.goto("/issues");
  await expect(page.locator("tbody tr a[href^='/issues/']").first()).toBeVisible();
  const keys = await visibleKeys(page);
  expect(keys.length).toBeGreaterThan(10);
  expect(new Set(keys).size).toBe(keys.length);
});

test("scrolling the whole list shows every issue once", async ({ page }) => {
  const total = await issueTotal();
  await page.goto("/issues");
  await expect(keyLinks(page).first()).toBeVisible();
  const scroller = page.locator("tbody").locator("xpath=ancestor::*[contains(@style,'overflow') or @data-testid][1]");
  // Every row's summary link, by key or, for an issue with no key yet, by id.
  const seen = new Set<string>();
  const summaryLinks = page.locator("tbody tr td:nth-child(3) a[href^='/issues/']");
  let previousLast = "";
  for (let step = 0; step < 60; step++) {
    const keys = await visibleKeys(page);
    for (const href of await summaryLinks.evaluateAll((links) => links.map((a) => a.getAttribute("href")!))) seen.add(href);
    // Any key repeated inside one screen is the bug.
    expect(new Set(keys).size, `repeated keys on screen at step ${step}: ${keys.join(",")}`).toBe(keys.length);
    const last = keys[keys.length - 1];
    if (last === previousLast) break;
    previousLast = last;
    await page.mouse.move(700, 500);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(250);
  }
  expect(seen.size).toBe(total);
  void scroller;
});

test("a sort header re-orders through the server without repeating rows", async ({ page }) => {
  await page.goto("/issues");
  await expect(page.locator("tbody tr a[href^='/issues/']").first()).toBeVisible();
  const before = await visibleKeys(page);
  await page.getByRole("button", { name: "Key" }).click();
  await expect.poll(async () => (await visibleKeys(page))[0]).not.toBe(before[0]);
  const after = await visibleKeys(page);
  expect(new Set(after).size).toBe(after.length);
  // The server orders keys as strings ("BOOK-10" before "BOOK-2").
  expect([...after].sort()).toEqual(after);
});

test("an issue key opens its detail, and the deep link reloads", async ({ page }) => {
  await page.goto("/issues");
  const link = page.locator("tbody tr a[href^='/issues/']").first();
  const key = await link.innerText();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/issues/${key}$`));
  await expect(page.getByText(key).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(key).first()).toBeVisible();
});

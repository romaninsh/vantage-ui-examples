// Large scroll jumps (a dragged scrollbar, End) on the issue list: the rows on
// screen stay distinct, with no blank block above them, and the bottom shows
// the list's real last issues.
import { expect, test, type Page } from "@playwright/test";

const keyLinks = (page: Page) => page.locator("tbody tr a[href^='/issues/']").filter({ hasText: /^[A-Z]+-\d+$/ });

/** The element that scrolls the issue table. */
async function scrollTo(page: Page, where: "bottom" | "middle" | "top") {
  await page.evaluate((where) => {
    const body = document.querySelector("tbody")!;
    let el: HTMLElement | null = body.parentElement;
    while (el && el.scrollHeight <= el.clientHeight + 1) el = el.parentElement;
    if (!el) throw new Error("no scroller");
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTop = where === "bottom" ? max : where === "middle" ? max / 2 : 0;
  }, where);
  await page.waitForTimeout(600);
}

async function screenOk(page: Page, label: string) {
  const keys = await keyLinks(page).allInnerTexts();
  expect(keys.length, `${label}: rows on screen`).toBeGreaterThan(5);
  expect(new Set(keys).size, `${label}: repeated keys ${keys.join(",")}`).toBe(keys.length);
  return keys;
}

test.use({ viewport: { width: 1440, height: 1400 } });

test("jumping to the bottom, the middle and back keeps rows distinct", async ({ page }) => {
  await page.goto("/issues");
  await expect(keyLinks(page).first()).toBeVisible();
  const top = await screenOk(page, "top");
  await scrollTo(page, "bottom");
  const bottom = await screenOk(page, "bottom");
  expect(bottom).not.toContain(top[0]);
  await scrollTo(page, "middle");
  await screenOk(page, "middle");
  await scrollTo(page, "top");
  expect((await screenOk(page, "top again"))[0]).toBe(top[0]);
});

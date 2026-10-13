// What the server sends the real page while the issue list scrolls to the
// bottom and back to the top: every frame's ids must be distinct, and every
// absolute row position must keep the same id across frames.
import { expect, test, type Page } from "@playwright/test";

const keyLinks = (page: Page) => page.locator("tbody tr a[href^='/issues/']").filter({ hasText: /^[A-Z]+-\d+$/ });

async function scrollTo(page: Page, where: "bottom" | "top") {
  await page.evaluate((where) => {
    let el: HTMLElement | null = document.querySelector("tbody")!.parentElement;
    while (el && el.scrollHeight <= el.clientHeight + 1) el = el.parentElement;
    el!.scrollTop = where === "bottom" ? el!.scrollHeight : 0;
  }, where);
  await page.waitForTimeout(800);
}

test.use({ viewport: { width: 1440, height: 1400 } });

test("server frames stay consistent through a bottom-and-back scroll", async ({ page }) => {
  const problems: string[] = [];
  const bySub = new Map<number, Map<number, string>>();
  const frames: string[] = [];
  page.on("websocket", (ws) => {
    ws.on("framesent", (f) => frames.push(`> ${String(f.payload).slice(0, 160)}`));
    ws.on("framereceived", (f) => {
      const frame = JSON.parse(String(f.payload));
      if (!Array.isArray(frame.ids)) return;
      frames.push(`< ${frame.t} sub ${frame.sub} start ${frame.start} ids ${frame.ids.length}`);
      if (new Set(frame.ids).size !== frame.ids.length) problems.push(`repeated ids in ${frame.t} sub ${frame.sub} start ${frame.start}`);
      const positions = bySub.get(frame.sub) ?? new Map<number, string>();
      bySub.set(frame.sub, positions);
      frame.ids.forEach((id: string, i: number) => {
        const at = frame.start + i;
        const before = positions.get(at);
        if (before && before !== id) problems.push(`sub ${frame.sub} row ${at}: ${before} then ${id}`);
        positions.set(at, id);
      });
    });
  });

  await page.goto("/issues");
  await expect(keyLinks(page).first()).toBeVisible();
  const top = await keyLinks(page).allInnerTexts();
  await scrollTo(page, "bottom");
  await scrollTo(page, "top");
  const back = await keyLinks(page).allInnerTexts();

  console.log(frames.join("\n"));
  expect(problems, problems.slice(0, 10).join("\n")).toEqual([]);
  expect(new Set(back).size, `repeated keys on screen: ${back.join(",")}`).toBe(back.length);
  expect(back[0]).toBe(top[0]);
});

// The two actions the staff app runs on the live API: "Close issue" (a
// confirm, then the row action) and "Recalculate estimates" (progress, then
// the body's notify as a flag). Each puts the data back afterwards.
import { expect, test } from "@playwright/test";
import { withLiveDb } from "./liveDb";

test("closing an issue asks first, then moves it to Done; it's put back", async ({ page }) => {
  const was = await withLiveDb(async (db) => {
    const [issue] = (await db.issues.where({ status: "backlog" }).limit(1).load()).elements;
    return { id: issue!.id, key: issue!.key!, status: issue!.status! };
  });
  try {
    await page.goto(`/issues/${was.key}`);
    const details = page.getByRole("complementary", { name: "Details" });
    await details.getByRole("button", { name: "Close issue" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(`Close ${was.key}?`)).toBeVisible();
    await dialog.getByRole("button", { name: "Close issue" }).click();
    await expect(dialog).toBeHidden();
    await expect(details.getByText("Done", { exact: true })).toBeVisible();
    await expect(details.getByRole("button", { name: "Close issue" })).toBeHidden();
    const status = await withLiveDb(async (db) => (await db.issues.ref(was.id).load())?.status);
    expect(status).toBe("done");
  } finally {
    await withLiveDb(async (db) => (await db.issues.ref(was.id).load())?.patch({ status: was.status }));
  }
});

test("recalculating estimates shows progress, then a flag; the epics are put back", async ({ page }) => {
  const PROJECT = "PAY";
  const epics = await withLiveDb(async (db) => {
    const all = (await db.issues.where({ type: "epic" }).load()).elements.filter((e) => e.project_key === PROJECT);
    return all.map((e) => ({ id: e.id, estimate: e.estimate }));
  });
  try {
    await page.goto(`/projects/${PROJECT}`);
    await page.getByRole("button", { name: "Recalculate estimates" }).click();
    await expect(page.getByText(/^\d+ of \d+ issues$/)).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Recalculating estimates" })).toBeVisible();
    await expect(page.getByText(new RegExp(`^Estimates recalculated in ${PROJECT}: \\d+ epics? changed\\.$`))).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Recalculate estimates" })).toBeVisible();
  } finally {
    await withLiveDb(async (db) => {
      for (const e of epics) await (await db.issues.ref(e.id).load())?.patch({ estimate: e.estimate });
    });
  }
});

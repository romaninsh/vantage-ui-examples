// Editing an issue on the live API: the summary and the description are
// changed through the page, checked after a reload, and put back; a comment
// is added and then deleted through the client, so the demo data stays as
// it was.
import { expect, test, type Page } from "@playwright/test";
import { withLiveDb } from "./liveDb";

const KEY = "BOOK-1";

/** The issue's current summary and description, read by a client of its own. */
const original = () =>
  withLiveDb(async (db) => {
    const [issue] = (await db.issues.where({ key: KEY }).limit(1).load()).elements;
    return { id: issue!.id, title: issue!.title ?? "", description: issue!.description };
  });

/** Puts the summary and description back if a failed run left them changed. */
const restore = (was: { id: string; title: string; description: string | null }) =>
  withLiveDb(async (db) => {
    const issue = await db.issues.ref(was.id).load();
    if (issue && (issue.title !== was.title || issue.description !== was.description)) {
      await issue.patch({ title: was.title, description: was.description });
    }
  });

async function editSummary(page: Page, title: string) {
  await page.getByRole("button", { name: "Edit summary" }).click();
  await page.getByRole("textbox", { name: "Summary" }).fill(title);
  await page.getByRole("textbox", { name: "Summary" }).press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

async function editDescription(page: Page, text: string) {
  await page.getByRole("button", { name: "Edit description" }).click();
  await page.getByRole("textbox", { name: "Description" }).fill(text);
  await page.getByRole("region", { name: "Description" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Edit description" })).toHaveText(text);
}

test("editing the summary saves it, and it's put back", async ({ page }) => {
  const was = await original();
  try {
    await page.goto(`/issues/${KEY}`);
    await expect(page.getByRole("heading", { level: 1, name: was.title })).toBeVisible();
    const title = `e2e title ${Date.now()}`;
    await editSummary(page, title);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await editSummary(page, was.title);
  } finally {
    await restore(was);
  }
});

test("editing the description saves it, and it's put back", async ({ page }) => {
  const was = await original();
  try {
    await page.goto(`/issues/${KEY}`);
    const text = `e2e description ${Date.now()}\nsecond line`;
    await editDescription(page, text);
    await page.reload();
    await expect(page.getByRole("button", { name: "Edit description" })).toHaveText(text);
    if (was.description) await editDescription(page, was.description);
  } finally {
    await restore(was);
  }
});

test("adding a comment shows it in the thread; it's then deleted", async ({ page }) => {
  const body = `e2e comment ${Date.now()}`;
  const { id } = await original();
  try {
    await page.goto(`/issues/${KEY}`);
    await page.getByRole("button", { name: "Add a comment…" }).click();
    await page.getByRole("textbox", { name: "Comment" }).fill(body);
    await page.getByRole("region", { name: "Activity" }).getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("region", { name: "Activity" }).getByText(body)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name: "Activity" }).getByText(body)).toBeVisible();
  } finally {
    // The spec finds its own comment among the issue's thread to remove it.
    const deleted = await withLiveDb(async (db) => {
      const thread = await db.comments.where({ issue: id }).load();
      const mine = thread.elements.filter((c) => c.body === body);
      for (const c of mine) await c.delete();
      return mine.length;
    });
    expect(deleted).toBe(1);
  }
});

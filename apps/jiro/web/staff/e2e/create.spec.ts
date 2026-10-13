// The top bar's Create dialog against the live API: the new issue is
// inserted and opened, then removed again through the client so the
// demo data stays as it was.
import { expect, test } from "@playwright/test";
import { withLiveDb } from "./liveDb";

/** Deletes the issue with `id`. */
const deleteIssue = (id: string) =>
  withLiveDb(async (db) => {
    const issue = await db.issues.ref(id).load();
    return issue ? issue.delete() : { ok: false as const, error: { message: `issue ${id} not found` } };
  });

test("Create inserts an issue and opens it", async ({ page }) => {
  const title = `e2e test issue ${Date.now()}`;
  await page.goto("/issues");
  await page.getByRole("button", { name: "Create" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Summary").fill(title);
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(dialog).toBeHidden();
  // The API doesn't give new issues a key, so the page is the issue's id.
  const id = decodeURIComponent(new URL(page.url()).pathname.replace(/^\/issues\//, ""));
  expect(id).toMatch(/^issue:/);

  // A reload finds it again by id.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  const deleted = await deleteIssue(id);
  expect(deleted.ok, deleted.ok ? "" : deleted.error.message).toBe(true);
});

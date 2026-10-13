// The restock wizard on the live API, signed in as the Leeds manager. The
// spec adds three empty products of its own (no stock), restocks only those,
// reloads the page mid-run and checks the page follows the same run to its
// summary; then it stops the run if it is still going and deletes the
// products, so the demo data stays as it was.
import { expect, test } from "@playwright/test";
import { withLiveDb } from "./liveDb";

const TOKEN = "leeds-token";
const tag = Date.now().toString(36);
const NAMES = ["A", "B", "C"].map((n) => `e2e loaf ${tag} ${n}`);
let ids: string[] = [];
/** The run the page started, from where `useRun` keeps it in sessionStorage. */
let runId: string | null = null;

test.beforeAll(async () => {
  ids = await withLiveDb(TOKEN, async (db) => {
    const made = [];
    for (const name of NAMES) {
      const r = await db.product.create({ name, bakery: "bakery:leeds", price: 100, calories: 200, is_deleted: false });
      if (!r.ok) throw new Error(r.error.message);
      made.push(r.value.id);
    }
    return made;
  });
});

test.afterAll(async () => {
  await withLiveDb(TOKEN, async (db) => {
    // A failed test can leave the run baking; stop it before its products go.
    const bakery = db.bakery.get("bakery:leeds");
    if (runId && bakery) {
      const run = bakery.$run.restock_bakery.attach(runId);
      await expect.poll(() => run.status, { timeout: 5_000 }).not.toBe("starting");
      if (run.status === "running") await run.cancel();
      await run.done;
    }
    for (const id of ids) await (await db.product.ref(id).load())?.delete();
  });
});

test("restock: start, confirm, progress, a reload mid-run, flags and the summary", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Token").fill(TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();

  const restock = page.getByRole("region", { name: "Restock" });
  await restock.getByRole("button", { name: "Next" }).click();
  const all = restock.getByRole("checkbox", { name: /^All low products \(\d+\)$/ });
  await expect(all).toBeChecked();
  await all.uncheck();
  for (const name of NAMES) await restock.getByRole("checkbox", { name: `${name} (0 left)` }).check();
  await restock.getByRole("button", { name: "Start restock" }).click();

  await expect(restock.getByText(/^Restock 3 products at .*Leeds\?$/)).toBeVisible();
  runId = await page.evaluate(
    () => Object.entries(sessionStorage).find(([k]) => k.startsWith("vantage.run.") && k.includes("restock_bakery"))?.[1] ?? null,
  );
  await restock.getByRole("button", { name: "Confirm" }).click();
  await expect(restock.getByText(/^[0-2] of 3 restocked$/)).toBeVisible();

  // The run goes on on the server; the reloaded page attaches to it. A message
  // sent before the attach is history, not a flag, so expect a flag for
  // whichever product finishes after it.
  await page.reload();
  await expect(restock.getByText(/^[0-2] of 3 restocked$/)).toBeVisible();
  await expect(page.getByText(new RegExp(`^e2e loaf ${tag} [ABC] is still low: 6 left\\.$`)).first()).toBeVisible({ timeout: 10_000 });
  await expect(restock.getByText(/^Restocked 3 products at .*Leeds: 18 units\.$/)).toBeVisible({ timeout: 10_000 });
  const stillLow = restock.getByText(/^Still low: /);
  for (const name of NAMES) await expect(stillLow).toContainText(name);

  const stock = await withLiveDb(TOKEN, async (db) => Promise.all(ids.map(async (id) => (await db.product.ref(id).load())?.stock)));
  expect(stock).toEqual([6, 6, 6]);
});

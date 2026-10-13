// Helpers for reading the app's server-backed tables in a live page.
import type { Page } from "@playwright/test";

/** The data rows of the table named `name` (spacer rows have no cells). */
export const rows = (page: Page, name: string) => page.getByRole("table", { name }).locator("tbody tr:has(td)");

/** The text of column `index` in every data row, top to bottom. */
export async function column(page: Page, table: string, index: number) {
  return rows(page, table).evaluateAll((trs, i) => trs.map((tr) => (tr.children[i] as HTMLElement).innerText.trim()), index);
}

/** The `open_table` frames the page sends from now on, parsed. */
export function openedTables(page: Page) {
  const frames: { table: string; where?: unknown[]; sort?: [string, string]; via?: { table: string; ref: string } }[] = [];
  page.on("websocket", (ws) =>
    ws.on("framesent", (f) => {
      const frame = JSON.parse(String(f.payload));
      if (frame.t === "open_table") frames.push(frame);
    }),
  );
  return frames;
}

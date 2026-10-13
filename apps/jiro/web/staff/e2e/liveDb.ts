// A client of the live API for the specs themselves: to read the real
// number of issues, and to remove what a spec created.
import { createVantage, type VantageDb } from "@vantage-ui/client";
import { schema, type Schema } from "../src/vantage.gen";

const base = process.env.VANTAGE_URL ?? "http://127.0.0.1:18090";

/** Runs `fn` with a connected client, closing it afterwards. */
export async function withLiveDb<T>(fn: (db: VantageDb<Schema>) => Promise<T>): Promise<T> {
  const db = createVantage<Schema>({ schema, url: `${base.replace(/^http/, "ws")}/v1/ws` });
  try {
    await db.ready;
    return await fn(db);
  } finally {
    db.close();
  }
}

/**
 * How many issues the server has. A whole collection loads complete, so its
 * length is the real count (a window's `total` is an estimate until then).
 */
export const issueTotal = () => withLiveDb(async (db) => (await db.issues.all.load()).length);

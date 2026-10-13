// A client of the live API for the specs themselves: to make the rows a spec
// works on, and to remove them afterwards.
import { createVantage, type VantageDb } from "@vantage-ui/client";
import { schema, type Schema } from "../src/vantage.gen";

const base = process.env.VANTAGE_URL ?? "http://127.0.0.1:18091";

/** Runs `fn` with a client signed in as `token`, closing it afterwards. */
export async function withLiveDb<T>(token: string, fn: (db: VantageDb<Schema>) => Promise<T>): Promise<T> {
  const db = createVantage<Schema>({ schema, token, url: `${base.replace(/^http/, "ws")}/v1/ws` });
  try {
    await db.ready;
    return await fn(db);
  } finally {
    db.close();
  }
}

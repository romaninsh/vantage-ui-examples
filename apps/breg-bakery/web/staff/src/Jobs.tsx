import { useEffect, useState } from "react";
import { observer, useAction, useJobs } from "@vantage-ui/client/react";
import { useDb } from "./db";
import { stripAnsi } from "./format";

export const Jobs = observer(function Jobs() {
  const db = useDb();
  const jobs = useJobs();
  // The dropdown runs the action's own `options:` script on the server, in our scope.
  const [shops, setShops] = useState<{ value: unknown; label: string }[]>([]);
  const [shop, setShop] = useState("");
  useEffect(() => {
    void db.options("magic-promotion", "bakery").then((items) => {
      setShops(items);
      setShop(String(items[0]?.value ?? ""));
    });
  }, [db]);
  const start = useAction((run: () => ReturnType<typeof db.run.restock>) => run());

  return (
    <section className="jobs">
      <div className="launch">
        <select value={shop} onChange={(e) => setShop(e.target.value)}>
          {shops.map((s) => (
            <option key={String(s.value)} value={String(s.value)}>
              {s.label}
            </option>
          ))}
        </select>
        <button disabled={!shop} onClick={() => start.run(() => db.run.magic_promotion({ bakery: shop, minutes: "1" }))}>
          ✨ Magic promotion (1 min)
        </button>
        <button disabled={!shop} onClick={() => start.run(() => db.run.restock({ bakery: shop, batches: "4" }))}>
          🥖 Restock ovens
        </button>
        <button onClick={() => start.run(() => db.run.chase_payments({ approach: "firm", limit: "10" }))}>💷 Chase payments</button>
        {!shop && <span className="hint">No shops to choose from.</span>}
        {start.error &&<span className="error">{start.error.message}</span>}
      </div>
      <div className="joblist">
        {jobs.slice(0, 3).map((j) => (
          <div className={`job ${j.state}`} key={j.job}>
            <div className="jobhead">
              <b>{j.label}</b> <span>{j.state === "running" ? "running" : `exit ${j.code}`}</span>
              {j.state === "running" && <button onClick={() => db.stopJob(j.job)}>Stop</button>}
            </div>
            <pre>{j.lines.slice(-8).map(stripAnsi).join("\n")}</pre>
          </div>
        ))}
      </div>
    </section>
  );
});

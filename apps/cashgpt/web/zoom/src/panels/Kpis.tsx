import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { monthLabel, usd } from "../zoomcharts";

/**
 * The picked month (or the latest) against the month before, from the
 * server's monthly totals for the line of business: seven rows, all loaded.
 */
export const Kpis = observer(({ lob, month }: { lob: string; month: string }) => {
  const db = useDb();
  const { items, error } = useCollection(db.kpi.where({ lob_id: lob }).sort("month_key", "asc"));
  if (error) return <p role="alert" className="card">{error}</p>;
  let at = items.length - 1;
  if (month !== "*") items.forEach((m, i) => { if (m.month_key === month) at = i; });
  const cur = items[at];
  const prev = at > 0 ? items[at - 1] : undefined;
  let ytd = 0;
  items.forEach((m, i) => { if (i <= at) ytd += m.spend_usd ?? 0; });

  const delta = (a?: number | null, b?: number | null) => (a == null || b == null || b === 0 ? null : ((a - b) / b) * 100);
  const tiles = [
    { label: `Spend, ${monthLabel(cur?.month_key)}`, value: usd(cur?.spend_usd), d: delta(cur?.spend_usd, prev?.spend_usd), upIsBad: true },
    { label: "Active users", value: cur?.users?.toLocaleString("en-GB") ?? "—", d: delta(cur?.users, prev?.users), upIsBad: false },
    { label: "Cost per active user", value: cur?.cost_per_user == null ? "—" : `$${cur.cost_per_user.toFixed(2)}`, d: delta(cur?.cost_per_user, prev?.cost_per_user), upIsBad: true },
    { label: `Spend, Jan to ${monthLabel(cur?.month_key).split(" ")[0]}`, value: items.length ? usd(ytd) : "—", d: null, upIsBad: true },
  ];
  return (
    <div className="kpis">
      {tiles.map((t) => (
        <div className="kpi" key={t.label}>
          <span className="label">{t.label}</span>
          <span className="value">{t.value}</span>
          {t.d != null && (
            <span className={`delta ${t.d > 0 === t.upIsBad ? "bad" : "good"}`}>
              {t.d > 0 ? "▲" : "▼"} {Math.abs(t.d).toFixed(1)}% on {monthLabel(prev?.month_key)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
});

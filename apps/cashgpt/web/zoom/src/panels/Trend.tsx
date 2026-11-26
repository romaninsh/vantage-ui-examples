import { observer, useCollection, useLive } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { providerColor, toolbar, useZoomChart, type Chart } from "../zoomcharts";

const monthStart = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return Date.UTC(y ?? 2000, (mo ?? 1) - 1, 1);
};
const monthOf = (ts: number) => new Date(ts).toISOString().slice(0, 7);

type Props = { lob: string; provider: string; month: string; onMonth: (m: string) => void };

/**
 * TimeChart: one stacked column series per provider. A click picks the month
 * under the cursor; the picked month is drawn as the chart's selection.
 */
export const Trend = observer(({ lob, provider, month, onMonth }: Props) => {
  const db = useDb();
  const q = provider === "*" ? db.trend.where({ lob_id: lob }) : db.trend.where({ lob_id: lob, provider });
  const rows = useCollection(q.sort("month_key", "asc"));

  const data = useLive(() => {
    if (rows.loadState !== "complete" || rows.items.length === 0) return null;
    const providers: string[] = [];
    const byMonth = new Map<string, Map<string, number>>();
    rows.items.forEach((r) => {
      const p = r.provider ?? "Other";
      if (!providers.includes(p)) providers.push(p);
      const m = byMonth.get(r.month_key ?? "") ?? new Map<string, number>();
      m.set(p, r.spend_usd ?? 0);
      byMonth.set(r.month_key ?? "", m);
    });
    const values = [...byMonth.entries()].map(([m, v]) => [monthStart(m), ...providers.map((p) => v.get(p) ?? 0)]);
    const from = values[0]?.[0] ?? 0;
    const to = (values[values.length - 1]?.[0] ?? 0) + 1;
    return {
      data: [{ id: "spend", preloaded: { from, to, dataLimitFrom: from, dataLimitTo: to, unit: "ms", values } }],
      series: providers.map((p, i) => ({
        id: p, name: p, type: "columns", stack: "spend", valueAxis: "primary",
        data: { source: "spend", index: i + 1, aggregation: "sum" },
        style: { lineColor: providerColor(p), fillColor: providerColor(p) },
      })),
    };
  }, [rows.loadState, rows.items]);

  const onCreate = (c: Chart & { selection?: (a?: number, b?: number) => unknown }) => {
    if (month !== "*") {
      const start = monthStart(month);
      const end = Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth() + 1, 1);
      c.selection?.(start, end);
    }
    c.on("click", (_e, args) => {
      if (typeof args?.hoverStart === "number") onMonth(monthOf(args.hoverStart));
    });
  };

  const ref = useZoomChart("TimeChart", () => ({
    area: { minHeight: 280 },
    valueAxis: { primary: { side: "left", title: "USD" } },
    navigation: { initialDisplayAnchor: "newestData", initialDisplayPeriod: "max", initialDisplayUnit: "1 M" },
    // click picks a month instead of zooming into it
    interaction: { resizing: { enabled: false }, scrolling: { enabled: true }, zooming: { enabled: true, click: false }, selection: { enabled: true } },
    info: { enabled: true },
    legend: { enabled: true, displayMode: "inline", height: 10, panel: { side: "bottom" } },
    toolbar: toolbar(),
  }), data, onCreate);

  if (rows.error) return <p role="alert">{rows.error}</p>;
  return <div ref={ref} className="chart tall" />;
});

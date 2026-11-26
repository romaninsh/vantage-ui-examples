import { observer, useCollection, useLive } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { providerColor, toolbar, useZoomChart, type Chart } from "../zoomcharts";

type Node = { id: string; name: string; value: number; subvalues?: Node[]; style: object };
type Props = { lob: string; month: string; onProvider: (p: string) => void };

/**
 * PieChart drill-down: provider → family → model, from the server's per-model
 * rows for the line of business and month. Opening a provider (or going
 * back to the top) reports the provider pick.
 */
export const ModelPie = observer(({ lob, month, onProvider }: Props) => {
  const db = useDb();
  const rows = useCollection(db.model_spend.where({ lob_id: lob, month_key: month }).sort("spend_usd", "desc"));

  const data = useLive(() => {
    if (rows.loadState !== "complete") return null;
    const providers = new Map<string, Node>();
    rows.items.forEach((r) => {
      const pName = r.provider ?? "Other";
      const color = providerColor(pName);
      let p = providers.get(pName);
      if (!p) {
        p = { id: `p:${pName}`, name: pName, value: 0, subvalues: [], style: { expandable: true, fillColor: color } };
        providers.set(pName, p);
      }
      const fName = r.family ?? "Other";
      let f = p.subvalues!.find((x) => x.name === fName);
      if (!f) {
        f = { id: `${p.id}/f:${fName}`, name: fName, value: 0, subvalues: [], style: { expandable: true, fillColor: color } };
        p.subvalues!.push(f);
      }
      const v = r.spend_usd ?? 0;
      f.subvalues!.push({ id: `${f.id}/m:${r.model_id}`, name: r.model_name ?? r.model_id ?? "", value: v, style: { expandable: false, fillColor: color } });
      f.value += v;
      p.value += v;
    });
    return { data: [{ sortField: "value", preloaded: { id: "", subvalues: [...providers.values()] } }] };
  }, [rows.loadState, rows.items]);

  const onCreate = (c: Chart) => {
    // Only the user's own navigation counts: a fresh chart starts at the top
    // without clearing a provider picked elsewhere.
    let armed = false;
    c.on("click", () => (armed = true));
    c.on("chartUpdate", () => {
      if (!armed) return;
      const top = (c.getPie?.() ?? []).find((id) => id.startsWith("p:") && !id.includes("/"));
      onProvider(top ? top.slice(2) : "*");
    });
  };

  const ref = useZoomChart("PieChart", () => ({
    area: { minHeight: 300 },
    filters: { allowZeroValues: false },
    pie: { innerRadius: 0.5, theme: "flat" },
    slice: { minFraction: 0 },
    labels: { enabled: true, includeName: true, includePercent: true, insideLabel: "auto" },
    legend: { enabled: false },
    info: { enabled: true },
    interaction: { mode: "drilldown", resizing: { enabled: false }, selection: { enabled: true, swipe: true }, others: { enabled: true, maxSlicesVisible: 10 } },
    toolbar: toolbar(),
  }), data, onCreate);

  if (rows.error) return <p role="alert">{rows.error}</p>;
  return <div ref={ref} className="chart" />;
});

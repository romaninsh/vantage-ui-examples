import { observer, useCollection, useLive } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { providerColor, toolbar, useZoomChart, usd, type Chart } from "../zoomcharts";

const TOP = 4; // links kept per app with no provider picked, ranked by the server (rk)

type Props = { month: string; provider: string; onProvider: (p: string) => void };

/**
 * NetChart: apps (blue) linked to the models they call, coloured by provider,
 * for the picked month. With a provider picked it shows every model of that
 * provider; without, each app's top few. A click on a model picks its provider.
 */
export const AppNetwork = observer(({ month, provider, onProvider }: Props) => {
  const db = useDb();
  const q = provider === "*"
    ? db.app_models.where({ month_key: month, rk: { lte: TOP } })
    : db.app_models.where({ month_key: month, provider });
  const rows = useCollection(q.sort("spend_usd", "desc"));

  const data = useLive(() => {
    if (rows.loadState !== "complete") return null;
    const spend = new Map<string, number>();
    rows.items.forEach((r) => {
      spend.set(`a:${r.app_id}`, (spend.get(`a:${r.app_id}`) ?? 0) + (r.spend_usd ?? 0));
      spend.set(`m:${r.model_id}`, (spend.get(`m:${r.model_id}`) ?? 0) + (r.spend_usd ?? 0));
    });
    const max = Math.max(1, ...spend.values());
    const radius = (id: string) => 12 + 30 * Math.sqrt((spend.get(id) ?? 0) / max);
    const nodes = new Map<string, object>();
    const links: object[] = [];
    rows.items.forEach((r) => {
      const a = `a:${r.app_id}`;
      const m = `m:${r.model_id}`;
      if (!nodes.has(a)) nodes.set(a, { id: a, loaded: true, style: { label: r.app_name, radius: radius(a), fillColor: "#2F6FDB", lineColor: "#1D4FA8" } });
      if (!nodes.has(m)) nodes.set(m, { id: m, loaded: true, extra: { provider: r.provider }, style: { label: r.model_name, radius: radius(m), fillColor: providerColor(r.provider) } });
      links.push({ id: r.id, from: a, to: m, style: { radius: 1 + 6 * Math.sqrt((r.spend_usd ?? 0) / max), toDecoration: "arrow", label: "" }, extra: { spend: usd(r.spend_usd) } });
    });
    return { data: [{ preloaded: { nodes: [...nodes.values()], links } }] };
  }, [rows.loadState, rows.items]);

  const onCreate = (c: Chart) => {
    // The provider rides on the clicked node itself, so it stays right after a data refresh.
    c.on("click", (_e, args) => {
      const p: string | undefined = args?.clickNode?.data?.extra?.provider;
      if (p) onProvider(p);
    });
  };

  const ref = useZoomChart("NetChart", () => ({
    area: { minHeight: 340 },
    layout: { nodeSpacing: 40 },
    navigation: { mode: "showall" },
    interaction: { resizing: { enabled: false }, nodesMovable: true, panning: { enabled: true }, zooming: { wheel: true, fingers: true, initialAutoZoom: "overview" }, selection: { enabled: true, nodesSelectable: true, linksSelectable: false } },
    info: { enabled: true, showLabelByDefault: true },
    toolbar: toolbar(),
  }), data, onCreate);

  if (rows.error) return <p role="alert">{rows.error}</p>;
  return <div ref={ref} className="chart tall" />;
});

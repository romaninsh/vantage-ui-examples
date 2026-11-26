import { useEffect, useRef } from "react";

// The ZoomCharts 2 runtime is a global from the CDN script in index.html.
// Settings are typed loosely: they follow the native shapes the ZoomCharts
// MCP generates (generate_chart_code), adapted to live data.
export type Chart = {
  remove(): void;
  replaceSettings(s: object): Chart;
  updateSettings(s: object): Chart;
  getPie?(): string[];
  on(name: string, fn: (event: unknown, args: any) => void): void;
};
type ChartClass = new (settings: object) => Chart;
export type ChartKind = "TimeChart" | "PieChart" | "FacetChart" | "NetChart" | "GeoChart";
declare global {
  interface Window {
    ZoomCharts?: Record<ChartKind, ChartClass>;
    ZoomChartsLicense?: string;
    ZoomChartsLicenseKey?: string;
  }
}

export const ASSETS = "https://cdn.zoomcharts-cloud.com/2/nightly/assets/";

/** Settings every chart shares: assets, the toolbar ZoomCharts AI gives, no title. */
const base = {
  assetsUrlBase: ASSETS,
  advanced: { strictEscaping: true },
  title: { enabled: false },
};

/**
 * Mounts one ZoomCharts chart in the returned div. The chart is created the
 * first time `data` is there (with `settings` and `data` together); later
 * `data` is applied with replaceSettings, so zoom and drill-down survive a
 * refresh. `data` must keep its identity while the rows don't change.
 */
export function useZoomChart(kind: ChartKind, settings: () => object, data: object | null, onCreate?: (c: Chart) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<Chart | null>(null);

  useEffect(() => {
    const ZC = window.ZoomCharts;
    if (!ref.current || !ZC || !data) return;
    if (chart.current) {
      chart.current.replaceSettings(data);
      return;
    }
    const c = new ZC[kind]({ ...base, ...settings(), ...data, container: ref.current });
    chart.current = c;
    onCreate?.(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, data]);

  useEffect(
    () => () => {
      chart.current?.remove();
      chart.current = null;
    },
    [],
  );

  return ref;
}

// The ZoomCharts MCP also emits `items: ["zoomOut", "export", …]`; the 2.x
// nightly refuses string items ("is not of type 'Object'"), so each chart
// keeps its default buttons.
export const toolbar = (_items?: string[]) => ({
  enabled: true, export: true, fullscreen: true,
  location: "inside", side: "top", align: "right", showLabels: false,
});

/** One colour per provider, the same in every chart. */
export const PROVIDER_COLORS: Record<string, string> = {
  Anthropic: "#D97757",
  OpenAI: "#10A37F",
  Amazon: "#FF9900",
  GitHub: "#6E40C9",
  Meta: "#0866FF",
  Other: "#8A8F98",
};
export const providerColor = (p: string | null | undefined) => PROVIDER_COLORS[p ?? ""] ?? "#8A8F98";

export function usd(v: number | null | undefined): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

/** "2026-07" → "Jul 2026" */
export function monthLabel(m: string | null | undefined): string {
  if (!m) return "—";
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y ?? 2000, (mo ?? 1) - 1, 1)).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

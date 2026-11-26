import { observer, useCollection, useLive } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { toolbar, useZoomChart, usd } from "../zoomcharts";

/** GeoChart: one bubble per office city, area proportional to spend, for the line of business and month. */
export const OfficeMap = observer(({ lob, month }: { lob: string; month: string }) => {
  const db = useDb();
  const rows = useCollection(db.offices.where({ lob_id: lob, month_key: month }).sort("spend_usd", "desc"));

  const data = useLive(() => {
    if (rows.loadState !== "complete") return null;
    let max = 1;
    rows.items.forEach((r) => (max = Math.max(max, r.spend_usd ?? 0)));
    const nodes = rows.items
      .filter((r) => r.lat != null && r.lon != null)
      .map((r) => ({
        id: r.id,
        loaded: true,
        coordinates: [r.lon, r.lat],
        extra: { city: r.city, region: r.region, spend: r.spend_usd, headcount: r.headcount },
        style: {
          // Only the bigger offices carry a label, and only the city's name; the
          // figures are in the hover popup.
          label: (r.spend_usd ?? 0) >= max * 0.4 ? r.city ?? "" : "",
          radius: 4 + 26 * Math.sqrt((r.spend_usd ?? 0) / max),
          fillColor: "rgba(47, 111, 219, 0.55)",
          lineColor: "#1D4FA8",
          lineWidth: 1,
          draggable: false,
        },
      }));
    return {
      data: [{ id: "offices", preloaded: { nodes, links: [], west: -180, east: 180, south: -90, north: 90 }, perBoundsData: false }],
    };
  }, [rows.loadState, rows.items]);

  const ref = useZoomChart("GeoChart", () => ({
    area: { minHeight: 340 },
    advanced: { strictEscaping: true, crossOriginHeader: "anonymous" },
    background: { enabled: true, type: "tile", url: "https://ts.zoomcharts.com/{z}/{x}/{y}.png", params: { attribution: "© OpenStreetMap contributors" } },
    layers: [{ id: "locations", type: "items", data: { id: "offices" }, enabled: true, layout: { mode: "static" }, aggregation: { enabled: false } }],
    navigation: { initialLat: 35, initialLng: 25, initialZoom: 2 },
    interaction: { mode: "select", resizing: { enabled: false }, panning: { enabled: true }, zooming: { wheel: true, fingers: true, zoomInOnDoubleClick: true }, selection: { enabled: true, nodesSelectable: true, linksSelectable: false } },
    // Every office shows its figures on hover, labelled on the map or not. Built
    // as DOM text, so a city name can't inject markup.
    info: {
      enabled: true,
      nodeContentsFunction: (node: { extra?: { city?: string; region?: string; spend?: number; headcount?: number } }) => {
        const x = node.extra ?? {};
        const line = (text: string, css: string) => {
          const d = document.createElement("div");
          d.textContent = text;
          d.style.cssText = css;
          return d;
        };
        const el = document.createElement("div");
        el.style.cssText = "padding:8px 12px;background:#fff;font:13px/1.45 system-ui,sans-serif;color:#1b2330;white-space:nowrap";
        el.append(
          line(x.city ?? "", "font-weight:600"),
          line(`${usd(x.spend)} · ${x.headcount?.toLocaleString("en-GB") ?? "—"} people · ${x.region ?? ""}`, "color:#667085"),
        );
        return el;
      },
    },
    toolbar: toolbar(["export", "fullscreen"]),
  }), data);

  if (rows.error) return <p role="alert">{rows.error}</p>;
  return <div ref={ref} className="chart tall" />;
});

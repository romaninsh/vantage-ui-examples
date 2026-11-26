import { useRef } from "react";
import { useDb } from "../db";
import { toolbar, useZoomChart, usd, type Chart } from "../zoomcharts";

const ROOT = "GRP"; // the group, parent of every line of business

type Props = {
  month: string;
  initialPath: string[];
  onDrill: (path: string[], lob: string, lobName: string) => void;
};

/**
 * FacetChart drill-down over the org tree, for the picked month. Each level
 * loads from the server when it opens (where parent_org_id, month_key), never
 * the 6,600 units at once. After a drill, the line of business on the path is
 * reported up; after a reload (a new month), the chart reopens `initialPath`.
 */
export function OrgExplorer({ month, initialPath, onDrill }: Props) {
  const db = useDb();
  const units = useRef(new Map<string, { lob: string | null; name: string; level: number }>());

  const data = useRef({
    data: [{
      sortField: "value",
      dataFunction: (id: string | null, _limit: number, _offset: number, success: (d: object) => void, fail: (e: object) => void) => {
        db.org.where({ parent_org_id: id || ROOT, month_key: month }).sort("spend_usd", "desc").load()
          .then((c) => {
            if (c.error) return fail({ message: c.error });
            const subvalues = c.map((u) => {
              const orgId = u.org_id ?? u.id;
              units.current.set(orgId, { lob: u.lob_id, name: u.org_name ?? orgId, level: u.org_level ?? 0 });
              return {
                id: orgId,
                name: u.org_name ?? orgId,
                value: u.spend_usd ?? 0,
                style: { expandable: (u.org_level ?? 5) < 5 },
              };
            });
            success({ id: id ?? "", subvalues });
          })
          .catch((e: unknown) => fail({ message: String(e) }));
      },
    }],
  }).current;

  const onCreate = (c: Chart & { setPie?: (p: string[]) => unknown }) => {
    // While the chart reopens the path it had, its updates aren't the user's.
    let restoring = initialPath.length > 0;
    if (restoring) {
      c.setPie?.(initialPath);
      setTimeout(() => (restoring = false), 4000);
    }
    c.on("chartUpdate", () => {
      const path = c.getPie?.() ?? [];
      if (restoring) {
        if (path.join("/") === initialPath.join("/")) restoring = false;
        return;
      }
      const lobUnit = path.map((p) => units.current.get(p)).find((u) => u?.level === 2);
      onDrill(path, lobUnit?.lob ?? "*", lobUnit?.name ?? "");
    });
  };

  const ref = useZoomChart("FacetChart", () => ({
    area: { minHeight: 300 },
    horizontal: false,
    series: [{
      id: "spend", name: "Spend", type: "columns", valueAxis: "primary",
      data: { field: "value", aggregation: "sum" },
      style: { fillColor: "#2F6FDB", lineColor: "#1D4FA8" },
      valueLabels: { enabled: true, contentsFunction: (v: number) => usd(v) },
    }],
    facetAxis: { labels: { enabled: true } },
    valueAxis: { primary: { side: "left" } },
    interaction: { mode: "drilldown", resizing: { enabled: false }, selection: { enabled: true }, scrolling: { enabled: true }, zooming: { enabled: false } },
    info: { enabled: true },
    legend: { enabled: false },
    toolbar: toolbar(),
  }), data, onCreate);

  return <div ref={ref} className="chart" />;
}

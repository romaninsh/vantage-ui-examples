import { useState } from "react";
import { Kpis } from "./panels/Kpis";
import { Trend } from "./panels/Trend";
import { OrgExplorer } from "./panels/OrgExplorer";
import { ModelPie } from "./panels/ModelPie";
import { AppNetwork } from "./panels/AppNetwork";
import { OfficeMap } from "./panels/OfficeMap";
import { monthLabel } from "./zoomcharts";

/**
 * The three picks every chart shares. `*` is "all", as in the query tables.
 *   lob      ← org explorer drill-down → KPIs, trend, model pie, office map
 *   month    ← a click on the trend    → KPIs, org explorer, model pie, office map, app network
 *   provider ← model pie or app network → trend, app network
 * Active users and office spend aren't split by provider in the warehouse,
 * so those panels can't follow a provider pick.
 */
export type Filters = {
  lob: string;
  lobName: string;
  orgPath: string[]; // the org explorer's drill path, restored after a reload
  month: string;
  provider: string;
};
const ALL: Filters = { lob: "*", lobName: "", orgPath: [], month: "*", provider: "*" };

export function Explorer({ licensed }: { licensed: boolean }) {
  const [f, setF] = useState<Filters>(ALL);
  // Bumped when the line of business is cleared from a chip: the org explorer starts over.
  const [orgReset, setOrgReset] = useState(0);
  const set = (patch: Partial<Filters>) => setF((cur) => ({ ...cur, ...patch }));

  const chips = [
    f.lob !== "*" && { label: "Line of business", value: f.lobName, clear: () => { set({ lob: "*", lobName: "", orgPath: [] }); setOrgReset((n) => n + 1); } },
    f.month !== "*" && { label: "Month", value: monthLabel(f.month), clear: () => set({ month: "*" }) },
    f.provider !== "*" && { label: "Provider", value: f.provider, clear: () => set({ provider: "*" }) },
  ].filter(Boolean) as { label: string; value: string; clear: () => void }[];

  return (
    <div className="page">
      <header>
        <div>
          <h1>Spend Explorer</h1>
          <p className="sub">LLM spend at Northcrest, January to July 2026. Click any chart to filter the others.</p>
        </div>
        {!licensed && <span className="badge">ZoomCharts evaluation</span>}
      </header>

      <div className="chips" aria-label="Active filters">
        {chips.length === 0 && <span className="chip-empty">Whole bank · all months · all providers</span>}
        {chips.map((c) => (
          <button key={c.label} className="chip" onClick={c.clear} title={`Clear ${c.label.toLowerCase()}`}>
            <span className="chip-label">{c.label}</span> {c.value} <span aria-hidden>×</span>
          </button>
        ))}
        {chips.length > 1 && (
          <button className="chip-clear" onClick={() => { setF(ALL); setOrgReset((n) => n + 1); }}>Clear all</button>
        )}
      </div>

      <Kpis lob={f.lob} month={f.month} />

      {/* Charts are keyed by the filters they read: ZoomCharts keeps cached data
          across replaceSettings, so new filters get a new chart. */}
      <section className="card wide">
        <h2>Spend by provider, month by month</h2>
        <p className="note">Click a month to filter the page by it; click it again to clear. Scroll to zoom.</p>
        <Trend key={`${f.lob}|${f.provider}|${f.month}`} lob={f.lob} provider={f.provider} month={f.month}
          onMonth={(m) => set({ month: m === f.month ? "*" : m })} />
      </section>

      <div className="grid">
        <section className="card">
          <h2>Org explorer</h2>
          <p className="note">Click a bar to drill down; the line of business you're in filters the page.</p>
          <OrgExplorer key={`${f.month}|${orgReset}`} month={f.month} initialPath={f.orgPath}
            onDrill={(orgPath, lob, lobName) => set({ orgPath, lob, lobName })} />
        </section>
        <section className="card">
          <h2>Where the money goes</h2>
          <p className="note">Provider → model family → model. Opening a provider filters the trend and the network.</p>
          <ModelPie key={`${f.lob}|${f.month}`} lob={f.lob} month={f.month}
            onProvider={(p) => set({ provider: p })} />
        </section>
        <section className="card">
          <h2>Apps and the models they call</h2>
          <p className="note">
            {f.provider === "*" ? "Each app's four biggest models. " : `Every ${f.provider} model each app calls. `}
            Click a model to filter by its provider.
          </p>
          <AppNetwork key={`${f.month}|${f.provider}`} month={f.month} provider={f.provider}
            onProvider={(p) => set({ provider: p === f.provider ? "*" : p })} />
        </section>
        <section className="card">
          <h2>Spend by office</h2>
          <p className="note">Bubble size is the spend of the teams based there. Follows line of business and month.</p>
          <OfficeMap key={`${f.lob}|${f.month}`} lob={f.lob} month={f.month} />
        </section>
      </div>
    </div>
  );
}

// The restock wizard: pick a bakery, review its low-stock products, then
// start the bakery's `restock_bakery` run and confirm it. The bakery is kept
// in this tab's sessionStorage and the run's id by `useRun`, so a page reload
// comes back to the same step, following the same run.
import { useState } from "react";
import { ProgressTracker } from "@atlaskit/progress-tracker";
import { observer, useRun } from "@vantage-ui/client/react";
import { useDb } from "../db";
import type { Bakery } from "../vantage.gen";
import { PickBakery } from "./PickBakery";
import { ReviewProducts } from "./ReviewProducts";
import { RestockRun } from "./RestockRun";

const BAKERY_KEY = "breg.restock.bakery";

export const Restock = observer(function Restock() {
  const db = useDb();
  const [bakeryId, setBakeryId] = useState(() => sessionStorage.getItem(BAKERY_KEY));
  const choose = (id: string | null) => {
    if (id) sessionStorage.setItem(BAKERY_KEY, id);
    else sessionStorage.removeItem(BAKERY_KEY);
    setBakeryId(id);
  };
  // A bakery outside this principal's scope (another sign-in) starts over.
  const bakery = bakeryId ? db.bakery.get(bakeryId) : undefined;
  return (
    <section className="restock" aria-label="Restock">
      <h2>Restock a bakery</h2>
      {bakery ? <BakeryRestock key={bakery.id} bakery={bakery} onBack={() => choose(null)} /> : <PickBakery onPick={choose} steps={<Steps at={0} />} />}
    </section>
  );
});

/** The review step until the run starts, then the run itself. */
const BakeryRestock = observer(function BakeryRestock({ bakery, onBack }: { bakery: Bakery; onBack: () => void }) {
  const run = useRun(bakery.$run.restock_bakery, { key: bakery.id });
  if (run.status === "idle") {
    return <ReviewProducts bakery={bakery} onBack={onBack} onStart={(args) => run.start(args)} steps={<Steps at={1} />} />;
  }
  return <RestockRun run={run} bakery={bakery} onAgain={() => run.forget()} steps={<Steps at={2} />} />;
});

const STAGES = ["Bakery", "Products", "Restock"];

function Steps({ at }: { at: number }) {
  const items = STAGES.map((label, i) => ({
    id: label,
    label,
    percentageComplete: i < at ? 100 : 0,
    status: i < at ? ("visited" as const) : i === at ? ("current" as const) : ("unvisited" as const),
    noLink: true,
  }));
  return <ProgressTracker items={items} spacing="compact" label="Restock steps" />;
}

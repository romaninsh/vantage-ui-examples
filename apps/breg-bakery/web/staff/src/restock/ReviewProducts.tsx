// Step 2: the bakery's products below the low-stock line, each ticked to be
// restocked, and how many units an oven run makes. "Start restock" starts the
// run with the ticked ids; the server restocks only this bakery's products.
import { useState, type ReactNode } from "react";
import Button from "@atlaskit/button/new";
import { Checkbox } from "@atlaskit/checkbox";
import Select from "@atlaskit/select";
import { observer, useCollection } from "@vantage-ui/client/react";
import type { Bakery } from "../vantage.gen";

/** Below this many units, a product is low (the same line the app's low-stock table draws). */
export const LOW = 10;
const BATCHES = [6, 12, 24].map((n) => ({ value: n, label: `${n} units` }));

export type RestockArgs = { products: string[]; batch: number };

type Props = { bakery: Bakery; onBack: () => void; onStart: (args: RestockArgs) => void; steps: ReactNode };

export const ReviewProducts = observer(function ReviewProducts({ bakery, onBack, onStart, steps }: Props) {
  // The whole shop, not the first rows: products with no stock yet sort last.
  const products = useCollection(bakery.products.sort("stock", "asc"));
  const low = products.items.filter((p) => p.is_deleted !== true && (p.stock ?? 0) < LOW);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [batch, setBatch] = useState(BATCHES[0]!);
  const picked = low.filter((p) => !skipped.has(p.id));
  const all = low.length > 0 && picked.length === low.length;

  const toggle = (id: string) =>
    setSkipped((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <>
      {steps}
      {products.error && <p className="error">{products.error}</p>}
      {products.loadState !== "complete" && products.loadState !== "error" ? (
        <p className="hint">Checking the shelves…</p>
      ) : low.length === 0 ? (
        <p className="hint">Nothing at {bakery.name} is below {LOW}.</p>
      ) : (
        <div className="restock-products">
          <Checkbox
            label={`All low products (${low.length})`}
            isChecked={all}
            isIndeterminate={picked.length > 0 && !all}
            onChange={() => setSkipped(all ? new Set(low.map((p) => p.id)) : new Set())}
          />
          {low.map((p) => (
            <Checkbox key={p.id} label={`${p.name} (${p.stock ?? 0} left)`} isChecked={!skipped.has(p.id)} onChange={() => toggle(p.id)} />
          ))}
        </div>
      )}
      <div className="restock-row">
        <label htmlFor="restock-batch">Units per oven run</label>
        <div className="restock-select">
          <Select inputId="restock-batch" options={BATCHES} value={batch} onChange={(o) => o && setBatch(o)} />
        </div>
        <Button onClick={onBack}>Back</Button>
        <Button appearance="primary" isDisabled={picked.length === 0} onClick={() => onStart({ products: picked.map((p) => p.id), batch: batch.value })}>
          Start restock
        </Button>
      </div>
    </>
  );
});

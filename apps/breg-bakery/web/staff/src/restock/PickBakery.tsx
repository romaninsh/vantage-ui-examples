// Step 1: which bakery to restock, from the ones this principal sees.
import { useState, type ReactNode } from "react";
import Button from "@atlaskit/button/new";
import Select from "@atlaskit/select";
import { observer } from "@vantage-ui/client/react";
import { useDb } from "../db";

type Option = { value: string; label: string };

export const PickBakery = observer(function PickBakery({ onPick, steps }: { onPick: (id: string) => void; steps: ReactNode }) {
  const db = useDb();
  const options: Option[] = db.bakery.all.map((b) => ({ value: b.id, label: b.name ?? b.id }));
  const [choice, setChoice] = useState<Option | null>(null);
  const picked = choice ?? options[0] ?? null;
  return (
    <>
      {steps}
      <div className="restock-row">
        <label htmlFor="restock-bakery">Bakery</label>
        <div className="restock-select">
          <Select inputId="restock-bakery" options={options} value={picked} onChange={setChoice} />
        </div>
        <Button appearance="primary" isDisabled={!picked} onClick={() => picked && onPick(picked.value)}>
          Next
        </Button>
      </div>
      {options.length === 0 && <p className="hint">No bakeries to choose from.</p>}
    </>
  );
});

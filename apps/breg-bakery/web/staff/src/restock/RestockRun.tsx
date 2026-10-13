// Step 3: the run. It waits for the `confirmed` input before baking; then a
// progress bar follows `progress` of `total`, each `low_stock` message shows
// as a flag, and the result is the summary.
import { useState, type ReactNode } from "react";
import Button from "@atlaskit/button/new";
import { AutoDismissFlag, FlagGroup } from "@atlaskit/flag";
import WarningIcon from "@atlaskit/icon/core/status-warning";
import ProgressBar from "@atlaskit/progress-bar";
import SectionMessage from "@atlaskit/section-message";
import { token } from "@atlaskit/tokens";
import type { Run } from "@vantage-ui/client";
import { observer, useRunMessage, useShared } from "@vantage-ui/client/react";
import { count } from "../format";
import type { Bakery, BakeryRestockBakeryRun } from "../vantage.gen";

type RestockRunHandle = Run<BakeryRestockBakeryRun>;

/** What the action's body returns. */
type Summary = { restocked: number; units: number; still_low: string[] };

type Note = { id: string; text: string };

type Props = { run: RestockRunHandle; bakery: Bakery; onAgain: () => void; steps: ReactNode };

export const RestockRun = observer(function RestockRun({ run, bakery, onAgain, steps }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  // Newest first: a FlagGroup shows its first flag on top.
  useRunMessage(run, "low_stock", (m) =>
    setNotes((all) => [{ id: `${all.length}:${m.product}`, text: `${m.product} is still low: ${m.stock} left.` }, ...all]),
  );
  return (
    <>
      {steps}
      <Status run={run} bakery={bakery} onAgain={onAgain} />
      <FlagGroup onDismissed={(id) => setNotes((all) => all.filter((n) => n.id !== id))}>
        {notes.map((n) => (
          <AutoDismissFlag
            key={n.id}
            id={n.id}
            icon={<WarningIcon label="Warning" color={token("color.icon.warning")} />}
            title="Still low"
            description={n.text}
          />
        ))}
      </FlagGroup>
    </>
  );
});

const Status = observer(function Status({ run, bakery, onAgain }: Omit<Props, "steps">) {
  const again = <Button onClick={onAgain}>Restock again</Button>;
  switch (run.status) {
    case "starting":
      return <p className="hint">Starting…</p>;
    case "running":
      return <Running run={run} bakery={bakery} />;
    case "done": {
      const summary = run.result as Summary;
      return (
        <SectionMessage appearance="success" title="Restock finished">
          <p>
            Restocked {count(summary.restocked, "product")} at {bakery.name}: {count(summary.units, "unit")}.
          </p>
          {summary.still_low.length > 0 && <p>Still low: {summary.still_low.join(", ")}.</p>}
          {again}
        </SectionMessage>
      );
    }
    case "cancelled": {
      // The variables keep their last values after the run ends.
      const { progress, total } = run.state;
      return (
        <SectionMessage appearance="warning" title="Restock cancelled">
          <p>{progress > 0 ? `Stopped after ${count(progress, "product")} of ${total}.` : "Nothing was restocked."}</p>
          {again}
        </SectionMessage>
      );
    }
    default:
      return (
        <SectionMessage appearance="error" title="Restock failed">
          <p>{run.error?.message}</p>
          {again}
        </SectionMessage>
      );
  }
});

/** Asks for the `confirmed` input, then shows the bar. Only this re-renders as the run moves. */
const Running = observer(function Running({ run, bakery }: { run: RestockRunHandle; bakery: Bakery }) {
  const [confirmed, setConfirmed] = useShared(run, "confirmed");
  const total = useShared(run, "total");
  const progress = useShared(run, "progress");
  const cancel = <CancelRun run={run} />;
  if (total < 0) {
    return (
      <div className="restock-row">
        <span className="hint">Checking the shelves…</span>
        {cancel}
      </div>
    );
  }
  if (!confirmed) {
    return (
      <SectionMessage appearance="information" title={`Restock ${count(total, "product")} at ${bakery.name}?`}>
        <p>Each product gets one oven run.</p>
        <div className="restock-row">
          <Button appearance="primary" onClick={() => void setConfirmed(true)}>
            Confirm
          </Button>
          {cancel}
        </div>
      </SectionMessage>
    );
  }
  return (
    <div className="restock-row">
      <div className="restock-bar">
        <ProgressBar ariaLabel="Restock progress" value={total ? progress / total : 0} />
      </div>
      <span>
        {progress} of {total} restocked
      </span>
      {cancel}
    </div>
  );
});

/** Cancel, with the server's refusal shown if it refuses. */
function CancelRun({ run }: { run: RestockRunHandle }) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const cancel = async () => {
    const outcome = await run.cancel();
    setRefusal(outcome.ok ? null : outcome.error.message);
  };
  return (
    <>
      <Button appearance="subtle" onClick={() => void cancel()}>
        Cancel
      </Button>
      {refusal && (
        <span role="alert" className="error">
          {refusal}
        </span>
      )}
    </>
  );
}

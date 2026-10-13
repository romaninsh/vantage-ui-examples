// "Recalculate estimates" for one project: a run on the server that sets each
// epic's estimate to the sum of its children's points. While it goes, a
// progress bar counts the issues checked; the body's closing `notify` shows
// as a flag. The run's id is kept per project for this tab, so a reload
// follows the same run.
import { useState } from "react";
import Button from "@atlaskit/button/new";
import { AutoDismissFlag, FlagGroup } from "@atlaskit/flag";
import SuccessIcon from "@atlaskit/icon/core/status-success";
import ProgressBar from "@atlaskit/progress-bar";
import { token } from "@atlaskit/tokens";
import type { Run } from "@vantage-ui/client";
import { observer, useRun, useRunMessage, useShared } from "@vantage-ui/client/react";
import { useDb } from "../db";
import type { RecalculateEstimatesRun } from "../vantage.gen";

type Note = { id: number; text: string };

export const RecalculateEstimates = observer(function RecalculateEstimates({ projectKey }: { projectKey: string }) {
  const db = useDb();
  const run = useRun(db.run.recalculate_estimates, { key: projectKey });
  const [notes, setNotes] = useState<Note[]>([]);
  // Newest first: a FlagGroup shows its first flag on top.
  useRunMessage(run, "vantage.notify", (m) => setNotes((all) => [{ id: Date.now(), text: m.text }, ...all]));
  const busy = run.status === "starting" || run.status === "running";

  return (
    <span style={row}>
      {busy ? (
        <Progress run={run} />
      ) : (
        <Button onClick={() => run.start({ project: projectKey })}>Recalculate estimates</Button>
      )}
      {run.status === "failed" && <span role="alert" style={danger}>{run.error?.message}</span>}
      {run.status === "cancelled" && <Stopped run={run} />}
      <FlagGroup onDismissed={(id) => setNotes((all) => all.filter((n) => n.id !== id))}>
        {notes.map((n) => (
          <AutoDismissFlag
            key={n.id}
            id={n.id}
            icon={<SuccessIcon label="Done" color={token("color.icon.success")} />}
            title="Estimates recalculated"
            description={n.text}
          />
        ))}
      </FlagGroup>
    </span>
  );
});

/** The bar and its count; only this re-renders as `progress` moves. */
const Progress = observer(function Progress({ run }: { run: RecalculateRun }) {
  const progress = useShared(run, "progress");
  const total = useShared(run, "total");
  const [refusal, setRefusal] = useState<string | null>(null);
  const cancel = async () => {
    const outcome = await run.cancel();
    setRefusal(outcome.ok ? null : outcome.error.message);
  };
  return (
    <>
      <span style={{ width: 160 }}>
        <ProgressBar ariaLabel="Recalculating estimates" value={total ? progress / total : 0} isIndeterminate={!total} />
      </span>
      <span style={subtle}>
        {progress} of {total || "…"} issues
      </span>
      <Button appearance="subtle" onClick={() => void cancel()}>
        Cancel
      </Button>
      {refusal && (
        <span role="alert" style={danger}>
          {refusal}
        </span>
      )}
    </>
  );
});

/** What a cancelled run did before it stopped: the epics it changed stay changed. */
const Stopped = observer(function Stopped({ run }: { run: RecalculateRun }) {
  const { progress, total, changed } = run.state;
  return (
    <span style={subtle}>
      Stopped after {progress} of {total} issues; {changed} {changed === 1 ? "epic" : "epics"} changed.
    </span>
  );
});

type RecalculateRun = Run<RecalculateEstimatesRun>;

const row = { display: "inline-flex", alignItems: "center", gap: token("space.100") };
const subtle = { color: token("color.text.subtle") };
const danger = { color: token("color.text.danger") };

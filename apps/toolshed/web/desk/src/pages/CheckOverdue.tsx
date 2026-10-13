import { useState } from "react";
import { observer, useRun, useRunMessage, useShared } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { formatDate, overdueMessage } from "../format";

type Flagged = { name: string; borrower: string; due_on: string };

/** "Check overdue loans": runs the server's check-overdue action and follows its progress. */
export const CheckOverdue = observer(() => {
  const db = useDb();
  const check = useRun(db.run.check_overdue, { key: "desk" });
  const progress = useShared(check, "progress");
  const total = useShared(check, "total");
  const overdue = useShared(check, "overdue");
  const status = useShared(check, "status");
  const [flagged, setFlagged] = useState<Flagged[]>([]);
  useRunMessage(check, "overdue_tool", (m) => setFlagged((list) => [...list, m]));

  const busy = check.status === "starting" || check.status === "running";
  const start = () => {
    setFlagged([]);
    check.start({});
  };

  return (
    <section aria-label="Overdue check">
      <button type="button" disabled={busy} onClick={start}>
        Check overdue loans
      </button>
      {check.status !== "idle" && (
        <div>
          <progress aria-label="Checking loans" value={progress} max={total || 1} />{" "}
          <span>
            {progress} of {total}
          </span>
          {busy && status && <p>{status}</p>}
        </div>
      )}
      {check.status === "done" && <p role="status">{overdueMessage(overdue)}</p>}
      {check.status === "failed" && <p role="alert">The check failed: {check.error?.message}</p>}
      {check.status === "cancelled" && <p role="status">The check was cancelled.</p>}
      {flagged.length > 0 && (
        <ul aria-label="Overdue loans">
          {flagged.map((f) => (
            <li key={f.name}>
              {f.name}: {f.borrower}, due {formatDate(f.due_on)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

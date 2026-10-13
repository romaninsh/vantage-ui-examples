import { useState } from "react";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { schema, type ToolsFields } from "../vantage.gen";
import { formatDate, statusLabel } from "../format";
import { CheckOverdue } from "./CheckOverdue";

type Status = NonNullable<ToolsFields["status"]>;
const STATUSES = schema.tables.tools.columns.status.enum;

export const ToolList = observer(() => {
  const db = useDb();
  const [status, setStatus] = useState<Status | "all">("all");
  // The server filters and sorts; rows render in the order they arrive.
  const tools = status === "all" ? db.tools.sort("name", "asc") : db.tools.where({ status }).sort("name", "asc");
  const { items, loadState, error, length } = useCollection(tools);

  return (
    <main>
      <h1>Toolshed</h1>
      <CheckOverdue />

      <label>
        Status{" "}
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status | "all")}>
          <option value="all">All tools</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p role="alert">{error}</p>
      ) : loadState === "loading" && items.length === 0 ? (
        <p>Loading…</p>
      ) : (
        <table>
          <caption>{length === 1 ? "1 tool" : `${length} tools`}</caption>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Category</th>
              <th>Status</th>
              <th>Borrower</th>
              <th>Due back</th>
              <th>Overdue</th>
            </tr>
          </thead>
          <tbody>
            {items.map((tool) => (
              <tr key={tool.id}>
                <td>{tool.name}</td>
                <td>{tool.category}</td>
                <td>{statusLabel(tool.status)}</td>
                <td>{tool.borrower}</td>
                <td>{formatDate(tool.due_on)}</td>
                <td>{tool.overdue ? "Overdue" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
});

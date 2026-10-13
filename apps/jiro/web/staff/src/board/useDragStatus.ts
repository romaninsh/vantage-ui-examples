// Moving a card between board columns: a drop writes the issue's new status.
// The card changes column when the server moves it between the columns'
// collections; if the server refuses the write, the card stays where it was
// and a flag shows the message.
import { useCallback, useEffect, useState } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { IssueStatus } from "../jira/issueFields";
import type { Issues } from "../vantage.gen";

export type MoveRefusal = { id: number; title: string; message: string };

/** What a card carries while dragged, and what a column says it accepts. */
export type CardData = { kind: "issue-card"; id: string };
export type ColumnData = { kind: "board-column"; status: IssueStatus };

const isCard = (data: Record<string | symbol, unknown>): data is CardData => data.kind === "issue-card";
const isColumn = (data: Record<string | symbol, unknown>): data is ColumnData => data.kind === "board-column";

let nextRefusal = 1;

export function useDragStatus(find: (id: string) => Issues | undefined) {
  const [refusals, setRefusals] = useState<MoveRefusal[]>([]);

  const move = useCallback(async (issue: Issues, status: IssueStatus) => {
    if (issue.status === status) return;
    const result = await issue.patch({ status });
    if (!result.ok) {
      const refusal = { id: nextRefusal++, title: `Couldn't move ${issue.key ?? issue.id}`, message: result.error.message };
      setRefusals((list) => [refusal, ...list]);
    }
  }, []);

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => isCard(source.data),
        onDrop: ({ source, location }) => {
          const target = location.current.dropTargets[0];
          if (!target || !isCard(source.data) || !isColumn(target.data)) return;
          const issue = find(source.data.id);
          if (issue) void move(issue, target.data.status);
        },
      }),
    [find, move],
  );

  const dismiss = useCallback((id: number | string) => setRefusals((list) => list.filter((r) => r.id !== id)), []);

  return { move, refusals, dismiss };
}

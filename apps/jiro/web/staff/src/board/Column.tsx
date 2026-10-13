// A board column: the status name and count in Jira's small caps header,
// the cards the server lists for this status below, and a highlight while a
// card is dragged over it.
import { useEffect, useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import Spinner from "@atlaskit/spinner";
import { token } from "@atlaskit/tokens";
import type { LazyCollection } from "@vantage-ui/client";
import { observer, useCollection } from "@vantage-ui/client/react";
import { STATUS_LABELS, type IssueStatus } from "../jira/issueFields";
import type { Issues } from "../vantage.gen";
import { Card } from "./Card";
import type { ColumnData } from "./useDragStatus";

type Props = { status: IssueStatus; issues: LazyCollection<Issues> };

export const Column = observer(function Column({ status, issues }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [over, setOver] = useState(false);
  const { items, loadState, total, totalExact, error } = useCollection(issues);
  // The server's estimate shows as "N+" until it has sent the whole column.
  const count = totalExact ? `${total}` : total !== null ? `${total}+` : "";

  useEffect(
    () =>
      dropTargetForElements({
        element: ref.current!,
        getData: (): ColumnData => ({ kind: "board-column", status }),
        canDrop: ({ source }) => source.data.kind === "issue-card",
        onDragEnter: () => setOver(true),
        onDragLeave: () => setOver(false),
        onDrop: () => setOver(false),
      }),
    [status],
  );

  return (
    <section
      ref={ref}
      aria-label={STATUS_LABELS[status]}
      style={{ ...column, background: over ? token("color.background.selected") : token("elevation.surface.sunken") }}
    >
      <h2 style={header}>
        {STATUS_LABELS[status]} <span style={{ fontWeight: 400 }}>{count}</span>
      </h2>
      {error && (
        <p role="alert" style={{ color: token("color.text.danger"), font: token("font.body.small") }}>
          {error}
        </p>
      )}
      {loadState === "loading" && items.length === 0 && <Spinner size="small" label={`Loading ${STATUS_LABELS[status]}`} />}
      <div style={{ display: "flex", flexDirection: "column", gap: token("space.100") }}>
        {items.map((issue) => (
          <Card key={issue.id} issue={issue} />
        ))}
      </div>
    </section>
  );
});

const column = {
  width: 272,
  flexShrink: 0,
  padding: token("space.100"),
  borderRadius: token("radius.medium"),
  boxSizing: "border-box" as const,
  minHeight: "100%",
};
const header = {
  margin: `${token("space.050")} ${token("space.050")} ${token("space.150")}`,
  font: token("font.body.small"),
  fontWeight: 600,
  textTransform: "uppercase" as const,
  color: token("color.text.subtle"),
};

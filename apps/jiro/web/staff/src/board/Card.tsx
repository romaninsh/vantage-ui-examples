// A board card as Jira draws it: the title on top, then type, key, priority
// and the assignee's avatar along the bottom. Dragging it moves the issue.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { token } from "@atlaskit/tokens";
import { observer } from "@vantage-ui/client/react";
import { issueHref } from "../jira/issueHref";
import { IssueTypeIcon } from "../jira/IssueTypeIcon";
import { PriorityIcon } from "../jira/PriorityIcon";
import { PersonAvatar } from "../jira/PersonAvatar";
import type { Issues } from "../vantage.gen";
import type { CardData } from "./useDragStatus";

export const Card = observer(function Card({ issue }: { issue: Issues }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const navigate = useNavigate();
  const open = () => navigate(issueHref(issue));

  useEffect(
    () =>
      draggable({
        element: ref.current!,
        getInitialData: (): CardData => ({ kind: "issue-card", id: issue.id }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
    [issue.id],
  );

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`${issue.key} ${issue.title ?? ""}`}
      data-issue={issue.key}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      style={{ ...card, opacity: dragging ? 0.4 : 1 }}
    >
      <div style={{ color: token("color.text"), marginBottom: token("space.150"), overflowWrap: "anywhere" }}>{issue.title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: token("space.075") }}>
        <IssueTypeIcon type={issue.type} />
        <span style={{ font: token("font.body.small"), fontWeight: 600, color: token("color.text.subtle") }}>{issue.key}</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: token("space.050") }}>
          <PriorityIcon priority={issue.priority} />
          <PersonAvatar person={issue.assignee} name={issue.assignee_name} />
        </span>
      </div>
    </div>
  );
});

const card = {
  padding: token("space.150"),
  borderRadius: token("radius.small"),
  background: token("elevation.surface.raised"),
  boxShadow: token("elevation.shadow.raised"),
  cursor: "pointer",
  font: token("font.body"),
};

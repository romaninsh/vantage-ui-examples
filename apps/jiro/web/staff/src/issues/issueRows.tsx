// The issue list's columns: header label, width and how each cell renders.
import { Link } from "react-router";
import { token } from "@atlaskit/tokens";
import { issueHref } from "../jira/issueHref";
import { IssueTypeIcon } from "../jira/IssueTypeIcon";
import { PriorityIcon } from "../jira/PriorityIcon";
import { StatusLozenge } from "../jira/StatusLozenge";
import { PersonAvatar } from "../jira/PersonAvatar";
import { formatDate } from "../jira/format";
import { PRIORITY_LABELS } from "../jira/issueFields";
import { truncate, type Column } from "../list/ServerTable";
import type { Issues } from "../vantage.gen";

export const COLUMNS: Column<Issues>[] = [
  { key: "type", label: "Type", width: 4, cell: (i) => <IssueTypeIcon type={i.type} /> },
  {
    key: "key",
    label: "Key",
    width: 9,
    cell: (i) => (
      <Link to={issueHref(i)} style={{ color: token("color.link"), fontWeight: 500 }}>
        {i.key}
      </Link>
    ),
  },
  {
    key: "title",
    label: "Summary",
    width: 40,
    cell: (i) => (
      <Link to={issueHref(i)} style={{ ...truncate, color: token("color.text") }}>
        {i.title}
      </Link>
    ),
  },
  { key: "status", label: "Status", width: 11, cell: (i) => <StatusLozenge status={i.status} /> },
  {
    key: "assignee_name",
    label: "Assignee",
    width: 15,
    cell: (i) => (
      <span style={{ display: "flex", alignItems: "center", gap: token("space.100") }}>
        <PersonAvatar person={i.assignee} name={i.assignee_name} />
        <span style={{ ...truncate, color: i.assignee_name ? undefined : token("color.text.subtle") }}>
          {i.assignee_name ?? "Unassigned"}
        </span>
      </span>
    ),
  },
  {
    key: "priority",
    label: "Priority",
    width: 9,
    cell: (i) =>
      i.priority && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: token("space.050") }}>
          <PriorityIcon priority={i.priority} />
          {PRIORITY_LABELS[i.priority]}
        </span>
      ),
  },
  { key: "due_date", label: "Due date", width: 9, cell: (i) => formatDate(i.due_date) },
  { key: "updated_at", label: "Updated", width: 9, cell: (i) => formatDate(i.updated_at) },
];

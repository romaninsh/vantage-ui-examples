// Recent comments across every issue, newest first. The server sorts them
// by `created_at` and sends one window at a time as the list scrolls.
import { Link } from "react-router";
import { token } from "@atlaskit/tokens";
import { observer, useRecord } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { issueHref } from "../jira/issueHref";
import { IssueTypeIcon } from "../jira/IssueTypeIcon";
import { PersonAvatar } from "../jira/PersonAvatar";
import { formatDateTime } from "../jira/format";
import { ServerTable, truncate, type Column } from "../list/ServerTable";
import { fullHeight } from "../shell/Layout";
import { PageHeader } from "../shell/PageHeader";
import type { Comments } from "../vantage.gen";

/** The issue a comment is on: its type, key and summary, linking to it. */
const CommentIssue = observer(function CommentIssue({ comment }: { comment: Comments }) {
  const issue = useRecord(comment.issue).value;
  if (!issue) return null;
  return (
    <Link to={issueHref(issue)} style={{ display: "flex", alignItems: "center", gap: token("space.075"), minWidth: 0 }}>
      <IssueTypeIcon type={issue.type} />
      <span style={{ fontWeight: 500, flexShrink: 0 }}>{issue.key}</span>
      <span style={{ ...truncate, color: token("color.text") }}>{issue.title}</span>
    </Link>
  );
});

const COLUMNS: Column<Comments>[] = [
  { key: "created_at", label: "Posted", width: 16, cell: (c) => formatDateTime(c.created_at) },
  {
    key: "author_name",
    label: "Author",
    width: 18,
    cell: (c) => (
      <span style={{ display: "flex", alignItems: "center", gap: token("space.100") }}>
        <PersonAvatar person={c.author} name={c.author_name} />
        <span style={truncate}>{c.author_name ?? "Someone"}</span>
      </span>
    ),
  },
  { key: "issue", label: "Issue", width: 30, cell: (c) => <CommentIssue comment={c} /> },
  { key: "body", label: "Comment", width: 36, cell: (c) => <span style={truncate}>{c.body}</span> },
];

export function Activity() {
  const db = useDb();
  return (
    <div style={fullHeight}>
      <PageHeader title="Activity" crumbs={[{ text: "Jiro", to: "/" }, { text: "Activity", to: "/activity" }]} />
      <ServerTable
        label="Activity"
        table="comments"
        rows={db.comments.all}
        initialSort={{ column: "created_at", direction: "desc" }}
        columns={COLUMNS}
        noun={["comment", "comments"]}
        emptyText="No comments yet."
      />
    </div>
  );
}

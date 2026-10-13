// The right-hand "Details" panel of an issue page, laid out as Jira does:
// a label column and a value column.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { token } from "@atlaskit/tokens";
import { observer } from "@vantage-ui/client/react";
import { IssueTypeIcon } from "../jira/IssueTypeIcon";
import { PersonAvatar } from "../jira/PersonAvatar";
import { PriorityIcon } from "../jira/PriorityIcon";
import { StatusLozenge } from "../jira/StatusLozenge";
import { PRIORITY_LABELS, TYPE_LABELS } from "../jira/issueFields";
import { formatDate } from "../jira/format";
import type { Issues } from "../vantage.gen";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt style={{ color: token("color.text.subtle"), font: token("font.body.small"), fontWeight: 600 }}>{label}</dt>
      <dd style={{ margin: 0, display: "flex", alignItems: "center", gap: token("space.100"), minHeight: 24 }}>{children}</dd>
    </>
  );
}

const None = () => <span style={{ color: token("color.text.subtlest") }}>None</span>;

export const DetailsPanel = observer(function DetailsPanel({ issue }: { issue: Issues }) {
  return (
    <aside aria-label="Details" style={panel}>
      <div style={{ marginBottom: token("space.200") }}>
        <StatusLozenge status={issue.status} />
      </div>
      <h2 style={heading}>Details</h2>
      <dl style={grid}>
        <Field label="Assignee">
          <PersonAvatar person={issue.assignee} name={issue.assignee_name} />
          {issue.assignee.id ? <Link to={`/people/${issue.assignee.id}`}>{issue.assignee_name}</Link> : <None />}
        </Field>
        <Field label="Priority">
          {issue.priority ? (
            <>
              <PriorityIcon priority={issue.priority} />
              {PRIORITY_LABELS[issue.priority]}
            </>
          ) : (
            <None />
          )}
        </Field>
        <Field label="Type">
          {issue.type ? (
            <>
              <IssueTypeIcon type={issue.type} />
              {TYPE_LABELS[issue.type]}
            </>
          ) : (
            <None />
          )}
        </Field>
        <Field label="Story points">{issue.estimate ?? <None />}</Field>
        <Field label="Due date">{issue.due_date ? formatDate(issue.due_date) : <None />}</Field>
        <Field label="Project">
          {issue.project_key ? <Link to={`/projects/${issue.project_key}`}>{issue.project_key}</Link> : <None />}
        </Field>
      </dl>
    </aside>
  );
});

const panel = {
  width: 340,
  flexShrink: 0,
  alignSelf: "flex-start",
  padding: token("space.200"),
  border: `1px solid ${token("color.border")}`,
  borderRadius: token("radius.medium"),
  boxSizing: "border-box" as const,
};
const heading = { font: token("font.heading.xsmall"), margin: `0 0 ${token("space.150")}` };
const grid = { display: "grid", gridTemplateColumns: "120px 1fr", rowGap: token("space.150"), margin: 0 };

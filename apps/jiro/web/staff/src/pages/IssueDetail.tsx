// One issue, laid out as Jira's issue view: breadcrumbs, the summary as the
// heading, the description and activity on the left, details on the right.
import { useMemo } from "react";
import { useParams } from "react-router";
import Spinner from "@atlaskit/spinner";
import { token } from "@atlaskit/tokens";
import { observer, useCollection, useRecord } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { Comments } from "../issue/Comments";
import { DetailsPanel } from "../issue/DetailsPanel";
import { EditableDescription } from "../issue/EditableDescription";
import { EditableTitle } from "../issue/EditableTitle";
import { issueHref } from "../jira/issueHref";
import { IssueTypeIcon } from "../jira/IssueTypeIcon";
import { Crumbs, type Crumb } from "../shell/Crumbs";
import type { Issues } from "../vantage.gen";

/** "JIR-12": an issue key, as list links carry. Anything else is an issue id. */
const ISSUE_KEY = /^[A-Z][A-Z0-9]*-\d+$/;

/** What shows while the issue loads, or once it's known not to exist. */
function Lookup({ param, issue, error, settled }: { param: string; issue?: Issues; error: string | null; settled: boolean }) {
  if (error) return <p role="alert">{error}</p>;
  if (issue) return <IssueView issue={issue} />;
  if (!settled) return <Spinner label="Loading issue" />;
  return (
    <p>
      Issue <strong>{param}</strong> doesn't exist.
    </p>
  );
}

/** Links carry the key, so the server finds the issue by key. */
const IssueByKey = observer(function IssueByKey({ issueKey }: { issueKey: string }) {
  const db = useDb();
  const found = useCollection(db.issues.where({ key: issueKey }).limit(1));
  return <Lookup param={issueKey} issue={found.items[0]} error={found.error} settled={found.loadState === "complete"} />;
});

/** An issue made in the Create dialog has no key yet; its link carries the id. */
const IssueById = observer(function IssueById({ id }: { id: string }) {
  const db = useDb();
  const record = useRecord(useMemo(() => db.issues.ref(id), [db, id]));
  return <Lookup param={id} issue={record.value} error={record.error} settled={record.status === "missing"} />;
});

export function IssueDetail() {
  const { key = "" } = useParams();
  return ISSUE_KEY.test(key) ? <IssueByKey issueKey={key} /> : <IssueById id={key} />;
}

const IssueView = observer(function IssueView({ issue }: { issue: Issues }) {
  const crumbs: Crumb[] = [{ text: "Projects", to: "/projects" }];
  if (issue.project_key) crumbs.push({ text: issue.project_key, to: `/projects/${issue.project_key}` });
  crumbs.push({ text: issue.key ?? "New issue", to: issueHref(issue) });

  return (
    <div style={{ display: "flex", gap: token("space.400"), alignItems: "flex-start" }}>
      <article style={{ flex: 1, minWidth: 0 }}>
        <Crumbs items={crumbs} />
        <div style={{ display: "flex", alignItems: "flex-start", gap: token("space.100"), margin: `${token("space.100")} 0 ${token("space.300")}` }}>
          <span style={{ paddingTop: token("space.100") }}>
            <IssueTypeIcon type={issue.type} />
          </span>
          <EditableTitle issue={issue} />
        </div>
        <EditableDescription issue={issue} />
        <Comments issueId={issue.id} />
      </article>
      <DetailsPanel issue={issue} />
    </div>
  );
});

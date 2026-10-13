// One person: who they are, and the issues assigned to them. The issues are
// opened through the person (`via` their `assigned` has-many), so the server
// narrows them, then filters and sorts them like the full list.
import { useMemo } from "react";
import { useParams } from "react-router";
import Lozenge from "@atlaskit/lozenge";
import Spinner from "@atlaskit/spinner";
import { token } from "@atlaskit/tokens";
import { observer, useRecord } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { IssueList } from "../issues/IssueList";
import { TEAM_LABELS } from "../jira/teams";
import { UserAvatar } from "../jira/UserAvatar";
import { fullHeight } from "../shell/Layout";
import { PageHeader } from "../shell/PageHeader";
import type { Users } from "../vantage.gen";

const PersonBody = observer(function PersonBody({ person }: { person: Users }) {
  return (
    <div style={fullHeight}>
      <PageHeader
        title={person.name}
        before={<UserAvatar name={person.name} initials={person.initials} size="large" />}
        crumbs={[
          { text: "People", to: "/people" },
          { text: person.name ?? person.id, to: `/people/${person.id}` },
        ]}
      >
        <span style={{ color: token("color.text.subtle") }}>{person.role}</span>
        {person.team && <Lozenge appearance="new">{TEAM_LABELS[person.team]}</Lozenge>}
        {person.active === false && <Lozenge>Inactive</Lozenge>}
      </PageHeader>
      <h2 style={heading}>Assigned issues</h2>
      <IssueList base={person.assigned} />
    </div>
  );
});

export const Person = observer(function Person() {
  const { id = "" } = useParams();
  const db = useDb();
  const record = useRecord(useMemo(() => db.users.ref(id), [db, id]));
  if (record.status === "error") return <p role="alert">{record.error}</p>;
  if (record.status === "missing") return <p>There's no one with id {id}.</p>;
  if (!record.value) return <Spinner label="Loading person" />;
  return <PersonBody key={record.value.id} person={record.value} />;
});

const heading = { font: token("font.heading.small"), margin: `0 0 ${token("space.150")}` };

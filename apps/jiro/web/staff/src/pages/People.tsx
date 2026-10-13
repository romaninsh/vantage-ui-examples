// The team directory, as Jira's People page: a grid of member cards with a
// large initials avatar, the name, the role and the team. The server sends
// them in name order; a card opens the person's page.
import { Link } from "react-router";
import Lozenge from "@atlaskit/lozenge";
import Spinner from "@atlaskit/spinner";
import { token } from "@atlaskit/tokens";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { TEAM_LABELS } from "../jira/teams";
import { UserAvatar } from "../jira/UserAvatar";
import { PageHeader } from "../shell/PageHeader";
import type { Users } from "../vantage.gen";

const PersonCard = observer(function PersonCard({ person }: { person: Users }) {
  return (
    <li aria-label={person.name ?? person.id}>
      <Link to={`/people/${person.id}`} style={card}>
        <UserAvatar name={person.name} initials={person.initials} size="xlarge" />
        <strong style={{ font: token("font.heading.xsmall"), marginTop: token("space.150"), color: token("color.text") }}>{person.name}</strong>
        <span style={{ color: token("color.text.subtle") }}>{person.role}</span>
        <span style={{ display: "flex", gap: token("space.050"), marginTop: token("space.100") }}>
          {person.team && <Lozenge appearance="new">{TEAM_LABELS[person.team]}</Lozenge>}
          {person.active === false && <Lozenge>Inactive</Lozenge>}
        </span>
      </Link>
    </li>
  );
});

export const People = observer(function People() {
  const db = useDb();
  const people = useCollection(db.users.sort("name", "asc"));
  return (
    <div>
      <PageHeader title="People" crumbs={[{ text: "Jiro", to: "/" }, { text: "People", to: "/people" }]} />
      {people.error ? (
        <p role="alert">{people.error}</p>
      ) : people.loadState === "loading" && people.items.length === 0 ? (
        <Spinner label="Loading people" />
      ) : (
        <ul aria-label="People" style={grid}>
          {people.items.map((p) => (
            <PersonCard key={p.id} person={p} />
          ))}
        </ul>
      )}
    </div>
  );
});

const grid = {
  listStyle: "none",
  margin: 0,
  padding: `0 0 ${token("space.400")}`,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: token("space.200"),
};
const card = {
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  textAlign: "center" as const,
  height: "100%",
  boxSizing: "border-box" as const,
  padding: token("space.300"),
  borderRadius: token("radius.large"),
  border: `1px solid ${token("color.border")}`,
  background: token("elevation.surface.raised"),
  textDecoration: "none",
};

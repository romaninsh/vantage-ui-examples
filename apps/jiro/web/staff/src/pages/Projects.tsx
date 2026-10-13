// Every project (Jira "space") as a table, sorted on the server; a name opens
// the project page.
import { Link } from "react-router";
import { token } from "@atlaskit/tokens";
import { useDb } from "../db";
import { ProjectLead } from "../jira/ProjectLead";
import { ProjectStatusLozenge } from "../jira/ProjectStatusLozenge";
import { ProjectTile } from "../jira/ProjectTile";
import { ServerTable, type Column } from "../list/ServerTable";
import { fullHeight } from "../shell/Layout";
import { PageHeader } from "../shell/PageHeader";
import type { Projects as Project } from "../vantage.gen";

const COLUMNS: Column<Project>[] = [
  {
    key: "name",
    label: "Name",
    width: 35,
    cell: (p) => (
      <Link to={`/projects/${p.key}`} style={{ display: "inline-flex", alignItems: "center", gap: token("space.100") }}>
        <ProjectTile projectKey={p.key ?? "?"} size={24} />
        {p.name}
      </Link>
    ),
  },
  { key: "key", label: "Key", width: 10, cell: (p) => p.key },
  { key: "client", label: "Client", width: 20, cell: (p) => p.client },
  { key: "lead_name", label: "Lead", width: 22, cell: (p) => <ProjectLead project={p} /> },
  { key: "status", label: "Status", width: 13, cell: (p) => <ProjectStatusLozenge status={p.status} /> },
];

export function Projects() {
  const db = useDb();
  return (
    <div style={fullHeight}>
      <PageHeader title="Projects" crumbs={[{ text: "Jiro", to: "/" }, { text: "Projects", to: "/projects" }]} />
      <ServerTable
        label="Projects"
        table="projects"
        rows={db.projects.all}
        columns={COLUMNS}
        noun={["project", "projects"]}
        emptyText="No projects yet."
      />
    </div>
  );
}

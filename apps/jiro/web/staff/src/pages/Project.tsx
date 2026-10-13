// One project: its header, then either its issues or its sprints. Both
// lists are opened through the project (`via` its has-many), so the server
// narrows them to this project, then filters and sorts them.
import { useParams } from "react-router";
import Spinner from "@atlaskit/spinner";
import { token } from "@atlaskit/tokens";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { IssueList } from "../issues/IssueList";
import { ProjectLead } from "../jira/ProjectLead";
import { ProjectStatusLozenge } from "../jira/ProjectStatusLozenge";
import { ProjectTile } from "../jira/ProjectTile";
import { fullHeight } from "../shell/Layout";
import { PageHeader } from "../shell/PageHeader";
import { PageTabs } from "../shell/PageTabs";
import { SprintList } from "../sprints/SprintList";
import type { Projects } from "../vantage.gen";

/** The project behind a `/projects/JIR` link, found by key on the server. */
function useProjectByKey(key: string) {
  const db = useDb();
  const found = useCollection(db.projects.where({ key }).limit(1));
  return { project: found.items[0], loaded: found.loadState === "complete", error: found.error };
}

const ProjectBody = observer(function ProjectBody({ project, view }: { project: Projects; view: "issues" | "sprints" }) {
  const key = project.key ?? "";
  return (
    <div style={fullHeight}>
      <PageHeader
        title={project.name}
        before={<ProjectTile projectKey={key} size={32} />}
        crumbs={[
          { text: "Projects", to: "/projects" },
          { text: project.name ?? key, to: `/projects/${key}` },
        ]}
      >
        <ProjectStatusLozenge status={project.status} />
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: token("space.100") }}>
          <span style={{ color: token("color.text.subtle") }}>Lead</span>
          <ProjectLead project={project} />
        </span>
      </PageHeader>
      <PageTabs
        label="Project views"
        tabs={[
          { label: "Issues", to: `/projects/${key}` },
          { label: "Sprints", to: `/projects/${key}/sprints` },
        ]}
      />
      {view === "issues" ? <IssueList base={project.issues} /> : <SprintList base={project.sprints} />}
    </div>
  );
});

const ProjectPage = observer(function ProjectPage({ view }: { view: "issues" | "sprints" }) {
  const { key = "" } = useParams();
  const { project, loaded, error } = useProjectByKey(key);
  if (error) return <p role="alert">{error}</p>;
  if (!project) return loaded ? <p>Project {key} doesn't exist.</p> : <Spinner label="Loading project" />;
  // Another project is another page: its filters and sort start over.
  return <ProjectBody key={project.id} project={project} view={view} />;
});

export const Project = () => <ProjectPage view="issues" />;
export const ProjectSprints = () => <ProjectPage view="sprints" />;

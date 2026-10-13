// Every sprint across projects, narrowed by project and state on the server.
import { useDb } from "../db";
import { fullHeight } from "../shell/Layout";
import { PageHeader } from "../shell/PageHeader";
import { SprintList } from "../sprints/SprintList";

export function Sprints() {
  const db = useDb();
  return (
    <div style={fullHeight}>
      <PageHeader title="Sprints" crumbs={[{ text: "Jiro", to: "/" }, { text: "Sprints", to: "/sprints" }]} />
      <SprintList base={db.sprints.all} acrossProjects />
    </div>
  );
}

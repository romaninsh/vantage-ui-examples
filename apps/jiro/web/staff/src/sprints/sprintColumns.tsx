// The sprint list's columns, and the sprint state lozenge Jira shows: active
// blue, planned grey ("future" in Jira), closed green.
import Lozenge, { type ThemeAppearance } from "@atlaskit/lozenge";
import { token } from "@atlaskit/tokens";
import { Link } from "react-router";
import { observer, useRecord } from "@vantage-ui/client/react";
import { formatDate } from "../jira/format";
import { ProjectTile } from "../jira/ProjectTile";
import type { Column } from "../list/ServerTable";
import { schema, type Sprints, type SprintsFields } from "../vantage.gen";

export type SprintState = NonNullable<SprintsFields["state"]>;

/** Sprint states in the API's order. */
export const SPRINT_STATES: readonly SprintState[] = schema.tables.sprints.columns.state.enum;

export const SPRINT_STATE_LABELS: Record<SprintState, string> = { planned: "Planned", active: "Active", closed: "Closed" };

const APPEARANCE: Record<SprintState, ThemeAppearance> = { planned: "default", active: "inprogress", closed: "success" };

export function SprintStateLozenge({ state }: { state: SprintState | null }) {
  if (!state) return null;
  return <Lozenge appearance={APPEARANCE[state]}>{SPRINT_STATE_LABELS[state]}</Lozenge>;
}

/** The sprint's project, as a tile and key linking to the project page. */
const SprintProject = observer(function SprintProject({ sprint }: { sprint: Sprints }) {
  const project = useRecord(sprint.project).value;
  if (!project?.key) return null;
  return (
    <Link to={`/projects/${project.key}`} style={{ display: "inline-flex", alignItems: "center", gap: token("space.100") }}>
      <ProjectTile projectKey={project.key} />
      {project.name}
    </Link>
  );
});

const NAME: Column<Sprints> = { key: "name", label: "Sprint", width: 30, cell: (s) => <strong>{s.name}</strong> };
const PROJECT: Column<Sprints> = { key: "project", label: "Project", width: 28, cell: (s) => <SprintProject sprint={s} /> };
const REST: Column<Sprints>[] = [
  { key: "state", label: "State", width: 14, cell: (s) => <SprintStateLozenge state={s.state} /> },
  { key: "start_date", label: "Start date", width: 14, cell: (s) => formatDate(s.start_date) },
  { key: "end_date", label: "End date", width: 14, cell: (s) => formatDate(s.end_date) },
];

/** Every sprint column, for the list across projects. */
export const SPRINT_COLUMNS: Column<Sprints>[] = [NAME, PROJECT, ...REST];

/** Without the project, for a list inside one project's page. */
export const PROJECT_SPRINT_COLUMNS: Column<Sprints>[] = [{ ...NAME, width: 44 }, ...REST];

// Sprints over any set (every sprint, or one project's): state chips and,
// across projects, a project picker narrow `base` on the server, and the
// table's headers sort it there.
import { useState } from "react";
import Button from "@atlaskit/button/new";
import { token } from "@atlaskit/tokens";
import type { LazyCollection } from "@vantage-ui/client";
import { ALL_PROJECTS, ProjectPicker } from "../jira/ProjectPicker";
import { ServerTable } from "../list/ServerTable";
import type { Sort } from "../list/SortHeader";
import type { Sprints } from "../vantage.gen";
import { PROJECT_SPRINT_COLUMNS, SPRINT_COLUMNS, SPRINT_STATES, SPRINT_STATE_LABELS, type SprintState } from "./sprintColumns";

/** The API declares no sprint order; newest first reads like Jira's sprint report. */
const INITIAL_SORT: Sort = { column: "start_date", direction: "desc" };

type Props = {
  base: LazyCollection<Sprints>;
  /** Offer the project picker and column (the list across projects). */
  acrossProjects?: boolean;
};

export function SprintList({ base, acrossProjects = false }: Props) {
  const [states, setStates] = useState<SprintState[]>([]);
  const [project, setProject] = useState(ALL_PROJECTS);
  let rows = base;
  if (project.value) rows = rows.where({ project: project.value });
  if (states.length) rows = rows.where({ state: states });

  const toggle = (s: SprintState) => setStates((list) => (list.includes(s) ? list.filter((v) => v !== s) : [...list, s]));

  return (
    <>
      <div style={bar}>
        {acrossProjects && <ProjectPicker value={project} onChange={setProject} />}
        <div role="group" aria-label="Sprint state" style={{ display: "flex", gap: token("space.075") }}>
          {SPRINT_STATES.map((s) => (
            <Button key={s} spacing="compact" isSelected={states.includes(s)} aria-pressed={states.includes(s)} onClick={() => toggle(s)}>
              {SPRINT_STATE_LABELS[s]}
            </Button>
          ))}
        </div>
      </div>
      <ServerTable
        label="Sprints"
        table="sprints"
        rows={rows}
        initialSort={INITIAL_SORT}
        columns={acrossProjects ? SPRINT_COLUMNS : PROJECT_SPRINT_COLUMNS}
        noun={["sprint", "sprints"]}
        emptyText="No sprints match these filters."
      />
    </>
  );
}

const bar = { display: "flex", flexWrap: "wrap" as const, alignItems: "center", gap: token("space.150"), marginBottom: token("space.200") };

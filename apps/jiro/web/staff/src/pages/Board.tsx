// The board: a column per status. Each column is its own server collection
// (the issues `where` status is that column's, in the API's default order),
// so the server decides which cards a column holds. A moved card changes
// column when the server reports the new membership.
import { useCallback, useState } from "react";
import { token } from "@atlaskit/tokens";
import { Column } from "../board/Column";
import { RefusalFlags } from "../board/RefusalFlags";
import { boardColumns } from "../board/columns";
import { useDragStatus } from "../board/useDragStatus";
import { useDb } from "../db";
import { ALL_PROJECTS, ProjectPicker } from "../jira/ProjectPicker";
import { PageHeader } from "../shell/PageHeader";
import { schema } from "../vantage.gen";

const ORDER = schema.tables.issues.defaultSort;

export function Board() {
  const db = useDb();
  const [project, setProject] = useState(ALL_PROJECTS);
  const base = project.value ? db.issues.where({ project: project.value }) : db.issues.all;
  const columns = boardColumns().map((status) => ({ status, issues: base.where({ status }).sort(ORDER.column, ORDER.direction) }));

  // A dragged card is a record already on screen, so the client holds it.
  const find = useCallback((id: string) => db.issues.get(id), [db]);
  const { refusals, dismiss } = useDragStatus(find);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Board" crumbs={[{ text: "Jiro", to: "/" }, { text: "Board", to: "/board" }]}>
        <div style={{ marginLeft: "auto" }}>
          <ProjectPicker value={project} onChange={setProject} />
        </div>
      </PageHeader>
      <div style={board}>
        {columns.map((c) => (
          <Column key={c.status} status={c.status} issues={c.issues} />
        ))}
      </div>
      <RefusalFlags refusals={refusals} onDismiss={dismiss} />
    </div>
  );
}

const board = {
  display: "flex",
  gap: token("space.150"),
  alignItems: "flex-start",
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  paddingBottom: token("space.200"),
};

// Every issue across projects, filtered and sorted on the server.
import { useDb } from "../db";
import { IssueList } from "../issues/IssueList";
import { fullHeight } from "../shell/Layout";
import { PageHeader } from "../shell/PageHeader";

export function Issues() {
  const db = useDb();
  return (
    <div style={fullHeight}>
      <PageHeader title="Issues" crumbs={[{ text: "Jiro", to: "/" }, { text: "Issues", to: "/issues" }]} />
      <IssueList base={db.issues.all} />
    </div>
  );
}

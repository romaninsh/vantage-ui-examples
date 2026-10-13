// The filter bar and the issue table over any set of issues (every issue, or
// one project's): filters narrow `base` on the server, and the table's
// headers sort it there.
import { useState } from "react";
import type { LazyCollection } from "@vantage-ui/client";
import { ServerTable } from "../list/ServerTable";
import type { Issues } from "../vantage.gen";
import { IssueFilters, NO_FILTERS, type Filters } from "./IssueFilters";
import { COLUMNS } from "./issueRows";

function filterIssues(base: LazyCollection<Issues>, filters: Filters) {
  let c = base;
  if (filters.statuses.length) c = c.where({ status: filters.statuses });
  if (filters.types.length) c = c.where({ type: filters.types });
  if (filters.priorities.length) c = c.where({ priority: filters.priorities });
  return c;
}

export function IssueList({ base }: { base: LazyCollection<Issues> }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  return (
    <>
      <IssueFilters value={filters} onChange={setFilters} />
      <ServerTable
        label="Issues"
        table="issues"
        rows={filterIssues(base, filters)}
        columns={COLUMNS}
        noun={["issue", "issues"]}
        emptyText="No issues match these filters."
      />
    </>
  );
}

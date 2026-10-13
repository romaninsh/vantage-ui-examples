import Lozenge from "@atlaskit/lozenge";
import type { ProjectsFields } from "../vantage.gen";

export function ProjectStatusLozenge({ status }: { status: ProjectsFields["status"] }) {
  if (!status) return null;
  return status === "active" ? <Lozenge appearance="success">Active</Lozenge> : <Lozenge>Archived</Lozenge>;
}

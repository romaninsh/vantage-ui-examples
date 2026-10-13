import { Link } from "react-router";
import { token } from "@atlaskit/tokens";
import { observer } from "@vantage-ui/client/react";
import type { Projects } from "../vantage.gen";
import { PersonAvatar } from "./PersonAvatar";

/** The project lead's avatar and name, linking to their person page. */
export const ProjectLead = observer(function ProjectLead({ project }: { project: Projects }) {
  const id = project.lead.id;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: token("space.100") }}>
      <PersonAvatar person={project.lead} name={project.lead_name} />
      {id ? <Link to={`/people/${id}`}>{project.lead_name}</Link> : "No lead"}
    </span>
  );
});

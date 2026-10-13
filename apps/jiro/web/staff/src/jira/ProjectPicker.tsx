// A compact select over every project, with "All projects" first. Its value
// is a project id ("" for all), ready for `where({ project })`.
import Select from "@atlaskit/select";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";

export type ProjectOption = { value: string; label: string };
export const ALL_PROJECTS: ProjectOption = { value: "", label: "All projects" };

export const ProjectPicker = observer(function ProjectPicker({ value, onChange }: { value: ProjectOption; onChange: (o: ProjectOption) => void }) {
  const projects = useCollection(useDb().projects.all);
  const options = [ALL_PROJECTS, ...projects.items.map((p) => ({ value: p.id, label: p.name ?? p.key ?? p.id }))];
  return (
    <div style={{ width: 240 }}>
      <Select aria-label="Project" spacing="compact" options={options} value={value} onChange={(o) => o && onChange(o)} />
    </div>
  );
});

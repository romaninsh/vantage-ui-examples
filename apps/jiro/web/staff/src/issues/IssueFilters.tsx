// The filter bar above the issue list: status chips that toggle on and off,
// and work-type and priority pickers.
import type { ReactNode } from "react";
import Button from "@atlaskit/button/new";
import Select from "@atlaskit/select";
import { token } from "@atlaskit/tokens";
import { IssueTypeIcon } from "../jira/IssueTypeIcon";
import { PriorityIcon } from "../jira/PriorityIcon";
import {
  PRIORITIES,
  PRIORITY_LABELS,
  STATUSES,
  STATUS_LABELS,
  TYPES,
  TYPE_LABELS,
  type IssuePriority,
  type IssueStatus,
  type IssueType,
} from "../jira/issueFields";

export type Filters = { statuses: IssueStatus[]; types: IssueType[]; priorities: IssuePriority[] };
export const NO_FILTERS: Filters = { statuses: [], types: [], priorities: [] };

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

type PickerProps<T extends string> = {
  label: string;
  values: readonly T[];
  labels: Record<T, string>;
  icon: (value: T) => ReactNode;
  picked: T[];
  onChange: (picked: T[]) => void;
};

/** A multi-select over one enum, each option with its Jira icon. */
function EnumPicker<T extends string>({ label, values, labels, icon, picked, onChange }: PickerProps<T>) {
  const options = values.map((value) => ({ value, label: labels[value] }));
  return (
    <div style={{ width: 200 }}>
      <Select
        aria-label={label}
        placeholder={label}
        isMulti
        isClearable
        spacing="compact"
        options={options}
        value={options.filter((o) => picked.includes(o.value))}
        onChange={(next) => onChange(next.map((o) => o.value))}
        formatOptionLabel={(o) => (
          <span style={{ display: "inline-flex", alignItems: "center", gap: token("space.075") }}>
            {icon(o.value)}
            {o.label}
          </span>
        )}
      />
    </div>
  );
}

export function IssueFilters({ value, onChange }: { value: Filters; onChange: (next: Filters) => void }) {
  const active = value.statuses.length > 0 || value.types.length > 0 || value.priorities.length > 0;
  return (
    <div style={bar}>
      <EnumPicker
        label="Type"
        values={TYPES}
        labels={TYPE_LABELS}
        icon={(type) => <IssueTypeIcon type={type} />}
        picked={value.types}
        onChange={(types) => onChange({ ...value, types })}
      />
      <EnumPicker
        label="Priority"
        values={PRIORITIES}
        labels={PRIORITY_LABELS}
        icon={(priority) => <PriorityIcon priority={priority} />}
        picked={value.priorities}
        onChange={(priorities) => onChange({ ...value, priorities })}
      />
      <div role="group" aria-label="Status" style={chips}>
        {STATUSES.map((status) => {
          const pressed = value.statuses.includes(status);
          return (
            <Button
              key={status}
              spacing="compact"
              isSelected={pressed}
              aria-pressed={pressed}
              onClick={() => onChange({ ...value, statuses: toggle(value.statuses, status) })}
            >
              {STATUS_LABELS[status]}
            </Button>
          );
        })}
      </div>
      {active && (
        <Button appearance="subtle" spacing="compact" onClick={() => onChange(NO_FILTERS)}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

const bar = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "center",
  gap: token("space.150"),
  marginBottom: token("space.200"),
};
const chips = { display: "flex", flexWrap: "wrap" as const, gap: token("space.075") };

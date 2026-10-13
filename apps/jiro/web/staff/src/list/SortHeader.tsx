// A column header in Jira's list style. A sortable one is a button that asks
// for the column's order from the server; the arrow shows the current order.
import ArrowDownIcon from "@atlaskit/icon/core/arrow-down";
import ArrowUpIcon from "@atlaskit/icon/core/arrow-up";
import { token } from "@atlaskit/tokens";
import type { TableMeta } from "@vantage-ui/client";

/** A server order, in the shape the API declares its default in. */
export type Sort = NonNullable<TableMeta["defaultSort"]>;

type Props = {
  label: string;
  column: string;
  sortable: boolean;
  /** The current order; null while the server's own order stands. */
  sort: Sort | null;
  onSort: (sort: Sort) => void;
};

export function SortHeader({ label, column, sortable, sort, onSort }: Props) {
  const active = sort?.column === column;
  const ariaSort = active ? (sort?.direction === "asc" ? "ascending" : "descending") : "none";
  if (!sortable) {
    return (
      <th scope="col" style={th}>
        {label}
      </th>
    );
  }
  // A new column starts ascending; clicking the active one flips it.
  const next: Sort = { column, direction: active && sort?.direction === "asc" ? "desc" : "asc" };
  return (
    <th scope="col" aria-sort={ariaSort} style={th}>
      <button type="button" style={button} onClick={() => onSort(next)}>
        {label}
        {active &&
          (sort?.direction === "asc" ? (
            <ArrowUpIcon label="ascending" size="small" />
          ) : (
            <ArrowDownIcon label="descending" size="small" />
          ))}
      </button>
    </th>
  );
}

const th = {
  textAlign: "left" as const,
  padding: `${token("space.100")} ${token("space.100")}`,
  color: token("color.text.subtle"),
  font: token("font.body.small"),
  fontWeight: token("font.weight.semibold"),
  borderBottom: `2px solid ${token("color.border")}`,
};
const button = {
  display: "inline-flex",
  alignItems: "center",
  gap: token("space.050"),
  padding: 0,
  border: 0,
  background: "none",
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
};

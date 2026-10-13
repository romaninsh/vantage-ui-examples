// A virtualised table in Jira's list style over a server collection. Rows
// render in the order the server sends them; a header click only asks the
// server to sort, and scrolling moves the server-side window. Nothing here
// reorders, filters or slices rows.
import { useState, type ReactNode } from "react";
import Spinner from "@atlaskit/spinner";
import { token } from "@atlaskit/tokens";
import type { LazyCollection, TableMeta } from "@vantage-ui/client";
import { observer } from "@vantage-ui/client/react";
import { schema } from "../vantage.gen";
import { SortHeader, type Sort } from "./SortHeader";
import { ROW_HEIGHT, useServerWindow } from "./useServerWindow";

export type Column<T> = {
  /** The column the server sorts by when this header is clicked. */
  key: string;
  label: string;
  /** Share of the table's width, in percent. */
  width: number;
  cell: (row: T) => ReactNode;
};

type Props<T> = {
  /** The table's accessible name. */
  label: string;
  /** The API table the rows come from; its meta says which columns sort, and the default order. */
  table: keyof typeof schema.tables;
  rows: LazyCollection<T>;
  /** The order to start on in place of the API's default. */
  initialSort?: Sort;
  columns: readonly Column<T>[];
  /** What a row is, for the footer count: ["issue", "issues"]. */
  noun: readonly [string, string];
  emptyText: string;
};

function TableBody<T extends { id: string }>({ label, table, rows, initialSort, columns, noun, emptyText }: Props<T>) {
  const meta: TableMeta = schema.tables[table];
  const [sort, setSort] = useState(() => initialSort ?? meta.defaultSort ?? null);
  const sorted = sort ? rows.sort(sort.column, sort.direction) : rows;
  const { scrollRef, visible, rowAt, total, exact, loading, error, padTop, padBottom } = useServerWindow(sorted);
  const empty = !loading && !error && total === 0;
  const count = exact ? `${total} ${total === 1 ? noun[0] : noun[1]}` : `${total}+ ${noun[1]}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      {error && (
        <div role="alert" style={alert}>
          {error}
        </div>
      )}
      <div ref={scrollRef} className="jiro-list-table" style={{ flex: 1, overflow: "auto" }}>
        <table aria-label={label} style={tableStyle}>
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={{ width: `${c.width}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => (
                <SortHeader key={c.key} label={c.label} column={c.key} sortable={!!meta.sortable?.includes(c.key)} sort={sort} onSort={setSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && <tr aria-hidden style={{ height: padTop }} />}
            {visible.map(({ index }) => {
              const row = rowAt(index);
              return (
                <tr key={row ? row.id : `loading-${index}`} style={{ height: ROW_HEIGHT }}>
                  {columns.map((c) => (
                    <td key={c.key} style={cell}>
                      {row ? c.cell(row) : skeleton}
                    </td>
                  ))}
                </tr>
              );
            })}
            {padBottom > 0 && <tr aria-hidden style={{ height: padBottom }} />}
          </tbody>
        </table>
        {loading && (
          <div style={centred}>
            <Spinner label={`Loading ${noun[1]}`} />
          </div>
        )}
        {empty && <p style={emptyStyle}>{emptyText}</p>}
      </div>
      <div style={footer}>{loading || error ? "" : count}</div>
    </div>
  );
}

export const ServerTable = observer(TableBody);

/** For cell text that should end in an ellipsis rather than wrap. */
export const truncate = { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

/** A grey bar for a row the server hasn't sent yet. */
const skeleton = <span style={{ display: "block", height: 8, borderRadius: 4, background: token("color.skeleton") }} />;

const tableStyle = { width: "100%", tableLayout: "fixed" as const, borderCollapse: "collapse" as const, font: token("font.body") };
const cell = { padding: `0 ${token("space.100")}`, overflow: "hidden" };
const alert = {
  padding: `${token("space.100")} ${token("space.200")}`,
  marginBottom: token("space.100"),
  borderRadius: token("radius.small"),
  background: token("color.background.danger"),
  color: token("color.text.danger"),
};
const centred = { display: "flex", justifyContent: "center", padding: token("space.400") };
const emptyStyle = { color: token("color.text.subtle"), padding: token("space.400") };
const footer = { padding: `${token("space.100")} 0`, color: token("color.text.subtlest"), font: token("font.body.small") };

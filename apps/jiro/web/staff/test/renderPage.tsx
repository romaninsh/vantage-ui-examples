// Renders one page against a MockServer seeded with `tables`, at `path`
// (matched by `route` when the page reads URL params). `server.opened`
// records the collections the page opens on the server.
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { VantageProvider } from "@vantage-ui/client/react";
import { createTestVantage, type Fixtures, type Row } from "@vantage-ui/client/testing";
import { schema, type Schema } from "../src/vantage.gen";

/** The tables, where the page is, and any other MockServer fixtures (such as `validate`). */
type Options = { tables: Record<string, Row[]>; path?: string; route?: string } & Omit<Fixtures, "tables">;

export function renderPage(page: ReactNode, { tables, path = "/", route = "*", ...fixtures }: Options) {
  const { db, server } = createTestVantage<Schema>(schema, { tables, ...fixtures });
  render(
    <MemoryRouter initialEntries={[path]}>
      <VantageProvider db={db}>
        <Routes>
          <Route path={route} element={page} />
        </Routes>
      </VantageProvider>
    </MemoryRouter>,
  );
  return { db, server };
}

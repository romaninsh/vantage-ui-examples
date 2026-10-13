import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { VantageProvider } from "@vantage-ui/client/react";
import { createTestVantage } from "@vantage-ui/client/testing";
import { App } from "../src/App";
import { schema, type Schema } from "../src/vantage.gen";

function renderAt(path: string) {
  const { db } = createTestVantage<Schema>(schema, {
    tables: {
      issues: [{ id: "iss-1", key: "JIR-1", title: "Login fails", type: "bug", status: "todo", priority: "high", project: "prj-1" }],
      projects: [{ id: "prj-1", key: "JIR", name: "Jiro Core", status: "active" }],
    },
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <VantageProvider db={db}>
        <App />
      </VantageProvider>
    </MemoryRouter>,
  );
}

/** The sidebar, as opposed to breadcrumbs and page links with the same names. */
const sidebar = () => within(screen.getByRole("navigation", { name: "Jiro" }));

describe("App shell", () => {
  it("sends / to the issue list inside the sidebar layout", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { name: "Issues" })).toBeInTheDocument();
    expect(await screen.findByText("JIR-1")).toBeInTheDocument();
    for (const page of ["Issues", "Board", "Sprints", "Activity", "Projects", "People"]) {
      expect(sidebar().getByRole("link", { name: page })).toBeInTheDocument();
    }
  });

  it("lists projects in the sidebar and follows its links without a reload", async () => {
    renderAt("/issues");
    expect(await sidebar().findByRole("link", { name: /Jiro Core/ })).toHaveAttribute("href", "/projects/JIR");
    fireEvent.click(sidebar().getByRole("link", { name: "Board" }));
    expect(await screen.findByRole("heading", { name: "Board" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "To Do" })).toBeInTheDocument();
  });
});

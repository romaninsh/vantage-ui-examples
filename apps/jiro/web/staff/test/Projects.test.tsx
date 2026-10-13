import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Project, ProjectSprints } from "../src/pages/Project";
import { Projects } from "../src/pages/Projects";
import { tables } from "./fixtures";
import { renderPage } from "./renderPage";

const rowOf = async (text: string) => within((await screen.findByText(text)).closest("tr")!);

describe("Projects", () => {
  it("lists projects in the server's default order, with lead and status", async () => {
    const { server } = renderPage(<Projects />, { tables });
    const row = await rowOf("Jiro Core");
    expect(row.getByRole("link", { name: "Ana Lopez" })).toHaveAttribute("href", "/people/mem-ana");
    expect(await row.findByText("AJL")).toBeInTheDocument();
    expect(row.getByText("Active")).toBeInTheDocument();
    expect((await rowOf("Website")).getByText("Archived")).toBeInTheDocument();
    expect(server.opened).toContainEqual(expect.objectContaining({ table: "projects", sort: ["key", "asc"] }));
  });

  it("sorts on the server when a header is clicked", async () => {
    const { server } = renderPage(<Projects />, { tables });
    await rowOf("Jiro Core");
    fireEvent.click(screen.getByRole("button", { name: "Client" }));
    await waitFor(() => expect(server.opened).toContainEqual(expect.objectContaining({ table: "projects", sort: ["client", "asc"] })));
  });
});

describe("Project page", () => {
  it("finds the project by key on the server", async () => {
    const { server } = renderPage(<Project />, { tables, path: "/projects/WEB", route: "/projects/:key" });
    expect(await screen.findByRole("heading", { name: "Website" })).toBeInTheDocument();
    expect(server.opened).toContainEqual(expect.objectContaining({ table: "projects", where: [["key", "eq", "WEB"]], limit: 1 }));
    // The page never opens the whole projects table to search it.
    expect(server.opened).not.toContainEqual(expect.objectContaining({ table: "projects", where: undefined }));
  });

  it("lists the project's issues through the project", async () => {
    const { server } = renderPage(<Project />, { tables, path: "/projects/JIR", route: "/projects/:key" });
    expect(await screen.findByRole("heading", { name: "Jiro Core" })).toBeInTheDocument();
    expect(await screen.findByText("JIR-1")).toBeInTheDocument();
    expect(screen.getByText("JIR-2")).toBeInTheDocument();
    expect(screen.queryByText("WEB-1")).not.toBeInTheDocument();
    expect(server.opened).toContainEqual(
      expect.objectContaining({ table: "issues", via: { table: "projects", id: "prj-jir", ref: "issues" }, sort: ["updated_at", "desc"] }),
    );
  });

  it("lists the project's sprints through the project", async () => {
    const { server } = renderPage(<ProjectSprints />, { tables, path: "/projects/JIR/sprints", route: "/projects/:key/sprints" });
    expect(await screen.findByText("JIR Sprint 2")).toBeInTheDocument();
    expect(screen.getByText("JIR Sprint 1")).toBeInTheDocument();
    expect(screen.queryByText("Web Launch")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sprints" })).toHaveAttribute("aria-current", "page");
    expect(server.opened).toContainEqual(expect.objectContaining({ table: "sprints", via: { table: "projects", id: "prj-jir", ref: "sprints" } }));
  });

  it("says so when no project has the key", async () => {
    renderPage(<Project />, { tables, path: "/projects/NOPE", route: "/projects/:key" });
    expect(await screen.findByText("Project NOPE doesn't exist.")).toBeInTheDocument();
  });
});

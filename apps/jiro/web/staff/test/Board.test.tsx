import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { Board } from "../src/pages/Board";
import { dragAndDrop } from "./dnd";
import { renderPage } from "./renderPage";

const issues = [
  { id: "iss-1", key: "JIR-1", title: "Login fails on Safari", type: "bug", status: "todo", priority: "high", project: "prj-1" },
  { id: "iss-2", key: "JIR-2", title: "Drag cards between columns", type: "story", status: "todo", priority: "medium", project: "prj-1" },
  { id: "iss-3", key: "JIR-3", title: "Write release notes", type: "task", status: "done", priority: "low", project: "prj-1" },
];

function setup() {
  const { server } = renderPage(<Board />, {
    tables: { issues, projects: [{ id: "prj-1", key: "JIR", name: "Jiro Core", status: "active" }] },
  });
  const column = (name: string) => screen.getByRole("region", { name });
  return { server, column };
}

describe("Board", () => {
  it("shows a column per status in the API's order, with counts", async () => {
    const { column } = setup();
    await screen.findByText("Login fails on Safari");
    const names = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(names).toEqual(["Backlog", "To Do", "In Progress", "In Review", "Done", "Won't Do"]);
    expect(within(column("To Do")).getByRole("heading")).toHaveTextContent("To Do 2");
    expect(within(column("Done")).getByText("Write release notes")).toBeInTheDocument();
  });

  it("writes the new status when a card is dropped on a column", async () => {
    const { server, column } = setup();
    const card = await screen.findByRole("button", { name: /JIR-2/ });
    await dragAndDrop(card, column("In Progress"));
    await waitFor(() => expect(within(column("In Progress")).getByText("Drag cards between columns")).toBeInTheDocument());
    expect(server.tables.get("issues")!.get("iss-2")).toMatchObject({ status: "in_progress" });
  });

  it("refused drop returns card", async () => {
    const { server, column } = setup();
    server.refuseWrites("issues: column `status` is not writable");
    const card = await screen.findByRole("button", { name: /JIR-2/ });
    await dragAndDrop(card, column("In Progress"));
    expect(await screen.findByText("issues: column `status` is not writable")).toBeInTheDocument();
    expect(within(column("To Do")).getByText("Drag cards between columns")).toBeInTheDocument();
    expect(within(column("In Progress")).queryByText("Drag cards between columns")).not.toBeInTheDocument();
  });
});

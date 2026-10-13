import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Row } from "@vantage-ui/client/testing";
import { StatusLozenge } from "../src/jira/StatusLozenge";
import { Issues } from "../src/pages/Issues";
import { renderPage } from "./renderPage";

const issue = (id: string, fields: Partial<Row>): Row => ({
  id,
  key: null,
  title: null,
  description: null,
  type: null,
  status: null,
  priority: null,
  project: null,
  project_key: "JIR",
  assignee: null,
  assignee_name: null,
  estimate: null,
  due_date: null,
  updated_at: null,
  ...fields,
});

const rows = [
  issue("iss-1", { key: "JIR-1", title: "Login fails on Safari", type: "bug", priority: "highest", status: "todo", assignee: "mem-ana", assignee_name: "Ana Lopez" }),
  issue("iss-2", { key: "JIR-2", title: "Drag cards between columns", type: "story", priority: "medium", status: "in_progress" }),
  issue("iss-3", { key: "JIR-3", title: "Write release notes", type: "task", priority: "low", status: "done", assignee: "mem-ben", assignee_name: "Ben Ito" }),
];

const users = [
  // A middle initial, so the test can tell the API's initials from ones made from the name.
  { id: "mem-ana", name: "Ana Lopez", initials: "AJL" },
  { id: "mem-ben", name: "Ben Ito", initials: "BI" },
];

const setup = () => renderPage(<Issues />, { tables: { issues: rows, users } });

async function rowOf(key: string) {
  const cell = await screen.findByText(key);
  return within(cell.closest("tr")!);
}

describe("Issues", () => {
  it("shows a row per issue with key, title, status, type and priority", async () => {
    setup();
    const expected = [
      ["JIR-1", "Login fails on Safari", "To Do", "Bug", "Priority: Highest"],
      ["JIR-2", "Drag cards between columns", "In Progress", "Story", "Priority: Medium"],
      ["JIR-3", "Write release notes", "Done", "Task", "Priority: Low"],
    ];
    for (const [key, title, status, type, priority] of expected) {
      const row = await rowOf(key!);
      expect(row.getByText(title!)).toBeInTheDocument();
      expect(row.getByText(status!)).toBeInTheDocument();
      expect(row.getByLabelText(type!)).toBeInTheDocument();
      expect(row.getByLabelText(priority!)).toBeInTheDocument();
    }
    // The assignee's avatar shows the initials the API serves.
    expect(await (await rowOf("JIR-1")).findByText("AJL")).toBeInTheDocument();
  });

  it("counts the issues in the footer once the server has sent them all", async () => {
    setup();
    expect(await screen.findByText("3 issues")).toBeInTheDocument();
  });

  it("shows the server's estimate as N+ while the list is still partial", async () => {
    // More issues than one window holds, so the server sends a window and a total it hasn't confirmed.
    const many = Array.from({ length: 200 }, (_, i) => issue(`iss-${i}`, { key: `JIR-${i}`, title: `Issue ${i}`, status: "todo" }));
    renderPage(<Issues />, { tables: { issues: many } });
    expect(await screen.findByText("200+ issues")).toBeInTheDocument();
    expect(screen.queryByText("200 issues")).not.toBeInTheDocument();
  });

  it("draws Won't Do in the done category's green, like Done", () => {
    render(
      <>
        <StatusLozenge status="done" />
        <StatusLozenge status="wont_do" />
        <StatusLozenge status="todo" />
      </>,
    );
    // A lozenge's colour is in the compiled classes on the text and the elements around it.
    const look = (text: string) => {
      const classes: string[] = [];
      for (let el: Element | null = screen.getByText(text), up = 0; el && up < 4; el = el.parentElement, up++) classes.push(el.className);
      return classes.join("|");
    };
    expect(look("Won't Do")).toBe(look("Done"));
    expect(look("Won't Do")).not.toBe(look("To Do"));
  });

  it("filters by status when a status chip is pressed", async () => {
    const { server } = setup();
    await rowOf("JIR-1");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(server.opened).toContainEqual(
        expect.objectContaining({ table: "issues", where: [["status", "in", ["done"]]] }),
      ),
    );
    await waitFor(() => expect(screen.queryByText("JIR-1")).not.toBeInTheDocument());
    expect(screen.getByText("JIR-3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
  });

  it("filters by priority when one is picked", async () => {
    const { server } = setup();
    await rowOf("JIR-1");
    const picker = screen.getByRole("combobox", { name: "Priority" });
    fireEvent.keyDown(picker, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: /Low$/ }));
    await waitFor(() =>
      expect(server.opened).toContainEqual(
        expect.objectContaining({ table: "issues", where: [["priority", "in", ["low"]]] }),
      ),
    );
    await waitFor(() => expect(screen.queryByText("JIR-1")).not.toBeInTheDocument());
    expect(screen.getByText("JIR-3")).toBeInTheDocument();
  });

  it("sorts on the server when a sortable header is clicked", async () => {
    const { server } = setup();
    await rowOf("JIR-1");
    fireEvent.click(screen.getByRole("button", { name: /Priority/ }));
    await waitFor(() =>
      expect(server.opened).toContainEqual(
        expect.objectContaining({ table: "issues", sort: ["priority", "asc"] }),
      ),
    );
  });
});

// The two actions the staff app runs as runs, against a MockServer: "Close
// issue" (a confirm, then the row action) and "Recalculate estimates" (a
// progress bar, then the body's notify as a flag).
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { IssueDetail } from "../src/pages/IssueDetail";
import { Project } from "../src/pages/Project";
import { tables } from "./fixtures";
import { renderPage } from "./renderPage";

const OPEN = ["todo", "in_progress", "backlog", "in_review"];
const available = { issues: (row: Record<string, unknown>) => (OPEN.includes(String(row.status)) ? ["close_issue"] : []) };

beforeEach(() => sessionStorage.clear());

describe("Close issue", () => {
  it("asks first, then closes the issue and the button goes", async () => {
    const { server } = renderPage(<IssueDetail />, {
      tables,
      path: "/issues/JIR-1",
      route: "/issues/:key",
      available,
      actions: { "issues.close_issue": () => ({ status: "done" }) },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Close issue" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Close JIR-1?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close issue" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.tables.get("issues")!.get("iss-1")!.status).toBe("done");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Close issue" })).not.toBeInTheDocument());
  });

  it("Cancel leaves the issue as it was", async () => {
    const { server } = renderPage(<IssueDetail />, { tables, path: "/issues/JIR-1", route: "/issues/:key", available });
    fireEvent.click(await screen.findByRole("button", { name: "Close issue" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.runs.size).toBe(0);
    expect(server.tables.get("issues")!.get("iss-1")!.status).toBe("todo");
  });

  it("once confirmed, the dialog can't be dismissed until the close ends", async () => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    renderPage(<IssueDetail />, {
      tables,
      path: "/issues/JIR-1",
      route: "/issues/:key",
      available,
      actions: {
        "issues.close_issue": async () => {
          await finished;
          return { status: "done" };
        },
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Close issue" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close issue" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled());
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    finish();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows the server's refusal in the dialog", async () => {
    renderPage(<IssueDetail />, {
      tables,
      path: "/issues/JIR-1",
      route: "/issues/:key",
      available,
      actions: {
        "issues.close_issue": () => {
          throw new Error("JIR-1 has open sub-tasks");
        },
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Close issue" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Close issue" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("JIR-1 has open sub-tasks");
  });
});

describe("Recalculate estimates", () => {
  it("shows the progress while it runs and the notify as a flag", async () => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    const { server } = renderPage(<Project />, {
      tables,
      path: "/projects/JIR",
      route: "/projects/:key",
      actions: {
        recalculate_estimates: async (_row, _args, run) => {
          run.update({ total: 4, progress: 1 });
          await finished;
          run.update({ progress: 4, changed: 1 });
          run.notify("Estimates recalculated in JIR: 1 epic changed.");
          return { checked: 4, changed: 1 };
        },
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Recalculate estimates" }));
    expect(await screen.findByText("1 of 4 issues")).toBeInTheDocument();
    expect([...server.runs.values()][0]!.args).toEqual({ project: "JIR" });
    finish();
    expect(await screen.findByText("Estimates recalculated in JIR: 1 epic changed.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Recalculate estimates" })).toBeInTheDocument();
  });

  it("a cancelled run says how far it got", async () => {
    renderPage(<Project />, {
      tables,
      path: "/projects/JIR",
      route: "/projects/:key",
      actions: {
        recalculate_estimates: async (_row, _args, run) => {
          run.update({ total: 4, progress: 2, changed: 1 });
          await new Promise(() => {}); // still going when Cancel is pressed
        },
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Recalculate estimates" }));
    expect(await screen.findByText("2 of 4 issues")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Stopped after 2 of 4 issues; 1 epic changed.")).toBeInTheDocument();
  });
});

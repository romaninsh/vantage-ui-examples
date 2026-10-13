// The top bar's Create dialog and key search, and the refused-connection
// banner, through the whole app against a MockServer.
import { describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { Fixtures } from "@vantage-ui/client/testing";
import { App } from "../src/App";
import { tables } from "./fixtures";
import { renderPage } from "./renderPage";

const renderApp = (path: string, fixtures: Omit<Fixtures, "tables"> = {}) => renderPage(<App />, { tables, path, ...fixtures });

async function submitNewIssue(title: string) {
  fireEvent.click(await screen.findByRole("button", { name: "Create" }));
  const dialog = within(await screen.findByRole("dialog"));
  fireEvent.change(dialog.getByLabelText(/Summary/), { target: { value: title } });
  fireEvent.click(dialog.getByRole("button", { name: "Create" }));
  return dialog;
}

describe("Create", () => {
  it("inserts the issue and opens it", async () => {
    const { server } = renderApp("/issues");
    await screen.findByText("JIR-1");
    await submitNewIssue("Export to CSV");
    expect(await screen.findByRole("heading", { name: "Export to CSV" })).toBeInTheDocument();
    // With no project picked, the dialog files the issue under the first one.
    const created = [...server.tables.get("issues")!.values()].find((i) => i.title === "Export to CSV");
    expect(created).toMatchObject({ project: "prj-jir" });
  });

  it("keeps the dialog open with the server's refusal", async () => {
    renderApp("/issues", { validate: (table) => (table === "issues" ? { title: "Summary must name the feature" } : undefined) });
    await screen.findByText("JIR-1");
    const dialog = await submitNewIssue("x");
    expect(await dialog.findByText("Summary must name the feature")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Top bar", () => {
  it("jumps to an issue by key", async () => {
    renderApp("/issues");
    const search = await screen.findByRole("textbox", { name: "Go to issue key" });
    fireEvent.change(search, { target: { value: "jir-2" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(await screen.findByRole("heading", { name: "Drag cards between columns" })).toBeInTheDocument();
  });

  it("shows a banner when the server refuses the connection", async () => {
    renderApp("/issues", { refuseHello: "token expired" });
    expect(await screen.findByText(/The server refused this connection: token expired/)).toBeInTheDocument();
  });
});

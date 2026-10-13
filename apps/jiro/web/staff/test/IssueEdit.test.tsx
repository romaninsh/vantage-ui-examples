// Editing an issue's summary and description, and adding comments, on the
// issue page against a MockServer: each saves through the client, and each
// shows the server's refusal inline.
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Fixtures, MockServer } from "@vantage-ui/client/testing";
import { IssueDetail } from "../src/pages/IssueDetail";
import { comments, tables } from "./fixtures";
import { renderPage } from "./renderPage";

const withDescription = { ...tables, issues: tables.issues.map((i) => (i.id === "iss-1" ? { ...i, description: "Steps:\n1. Open Safari" } : i)) };

function openIssue(fixtures: Omit<Fixtures, "tables"> = {}) {
  return renderPage(<IssueDetail />, { tables: withDescription, path: "/issues/JIR-1", route: "/issues/:key", ...fixtures });
}

/** The comment the server stored with `body`. */
const commentOn = (server: MockServer, body: string) => [...server.tables.get("comments")!.values()].find((c) => c.body === body);

beforeEach(() => localStorage.clear());

describe("Editing the summary", () => {
  it("saves on Enter", async () => {
    openIssue();
    fireEvent.click(await screen.findByRole("button", { name: "Edit summary" }));
    const field = screen.getByRole("textbox", { name: "Summary" });
    fireEvent.change(field, { target: { value: "Login fails on Safari 17" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(await screen.findByRole("heading", { level: 1, name: "Login fails on Safari 17" })).toBeInTheDocument();
  });

  it("cancels on Esc and refuses an empty summary", async () => {
    openIssue();
    fireEvent.click(await screen.findByRole("button", { name: "Edit summary" }));
    const field = screen.getByRole("textbox", { name: "Summary" });
    fireEvent.change(field, { target: { value: "  " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByText("Summary is required.")).toBeInTheDocument();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.getByRole("heading", { level: 1, name: "Login fails on Safari" })).toBeInTheDocument();
  });

  it("shows a refusal and goes back to the old summary", async () => {
    openIssue({ validate: (table) => (table === "issues" ? "issues: column `title` is not writable" : undefined) });
    fireEvent.click(await screen.findByRole("button", { name: "Edit summary" }));
    const field = screen.getByRole("textbox", { name: "Summary" });
    fireEvent.change(field, { target: { value: "Something else" } });
    fireEvent.blur(field);
    expect(await screen.findByText(/column `title` is not writable/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Login fails on Safari" })).toBeInTheDocument();
  });
});

describe("Editing the description", () => {
  it("saves with the Save button and keeps line breaks", async () => {
    openIssue();
    fireEvent.click(await screen.findByRole("button", { name: "Edit description" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), { target: { value: "Steps:\n1. Open Safari\n2. Sign in" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const shown = await screen.findByRole("button", { name: "Edit description" });
    expect(shown.textContent).toBe("Steps:\n1. Open Safari\n2. Sign in");
  });

  it("keeps the editor open with a refusal, and Cancel shows the old text", async () => {
    openIssue({ validate: (table) => (table === "issues" ? { description: "too long" } : undefined) });
    fireEvent.click(await screen.findByRole("button", { name: "Edit description" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), { target: { value: "x".repeat(50) } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/too long/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect((await screen.findByRole("button", { name: "Edit description" })).textContent).toBe("Steps:\n1. Open Safari");
  });
});

describe("Adding a comment", () => {
  const thread = () => within(screen.getByRole("region", { name: "Activity" }));

  async function postComment(body: string) {
    fireEvent.click(await screen.findByRole("button", { name: "Add a comment…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), { target: { value: body } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  }

  it("inserts it as the first person and shows it once the server lists it", async () => {
    const { server } = openIssue();
    await screen.findByText("Seen on Safari 17 too.");
    await postComment("Fixed in the next build.");
    await waitFor(() => expect(thread().getByText("Fixed in the next build.")).toBeInTheDocument());
    // It stays: the thread doesn't drop it when the server's update settles.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(thread().getByText("Fixed in the next build.")).toBeInTheDocument();
    expect(commentOn(server, "Fixed in the next build.")).toMatchObject({
      issue: "iss-1",
      author: "mem-ana",
      created_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    });
    expect(screen.queryByRole("textbox", { name: "Comment" })).not.toBeInTheDocument();
  });

  it("posts as the person picked, and remembers them", async () => {
    const { server } = openIssue();
    const picker = await screen.findByRole("combobox", { name: "Commenting as" });
    fireEvent.keyDown(picker, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Ben Ito" }));
    expect(localStorage.getItem("jiro.commentingAs")).toBe("mem-ben");
    await postComment("Picked author.");
    await thread().findByText("Picked author.");
    expect(commentOn(server, "Picked author.")).toMatchObject({ author: "mem-ben" });
  });

  it("shows a refusal and keeps the text", async () => {
    openIssue({ validate: (table) => (table === "comments" ? "comments: this issue is locked" : undefined) });
    await postComment("Will be refused.");
    expect(await screen.findByText("comments: this issue is locked")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("Will be refused.");
    await waitFor(() => expect(thread().queryByText("Will be refused.", { selector: "p" })).not.toBeInTheDocument());
    expect(comments).toHaveLength(2);
  });
});

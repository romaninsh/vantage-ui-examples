import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { Activity } from "../src/pages/Activity";
import { tables } from "./fixtures";
import { renderPage } from "./renderPage";

describe("Activity", () => {
  it("lists comments across issues, newest first, sorted by the server", async () => {
    const { server } = renderPage(<Activity />, { tables });
    expect(await screen.findByText("Moving this to review tomorrow.")).toBeInTheDocument();
    expect(server.opened).toContainEqual(expect.objectContaining({ table: "comments", sort: ["created_at", "desc"] }));
    const bodies = screen.getAllByRole("row").slice(1).map((r) => r.lastElementChild?.textContent);
    expect(bodies).toEqual(["Moving this to review tomorrow.", "Seen on Safari 17 too."]);
  });

  it("shows each comment's author and links to its issue", async () => {
    renderPage(<Activity />, { tables });
    const row = within((await screen.findByText("Seen on Safari 17 too.")).closest("tr")!);
    expect(row.getAllByText("Ben Ito").length).toBeGreaterThan(0);
    expect(await row.findByText("BI")).toBeInTheDocument();
    await waitFor(() => expect(row.getByRole("link", { name: /JIR-1/ })).toHaveAttribute("href", "/issues/JIR-1"));
  });
});

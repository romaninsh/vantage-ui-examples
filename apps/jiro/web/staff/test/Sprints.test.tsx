import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Sprints } from "../src/pages/Sprints";
import { tables } from "./fixtures";
import { renderPage } from "./renderPage";

const rowOf = async (text: string) => within((await screen.findByText(text)).closest("tr")!);

describe("Sprints", () => {
  it("lists every sprint, newest first, with its project and state", async () => {
    const { server } = renderPage(<Sprints />, { tables });
    const row = await rowOf("JIR Sprint 2");
    expect(row.getByText("Active")).toBeInTheDocument();
    expect(await row.findByText("Jiro Core")).toBeInTheDocument();
    expect((await rowOf("Web Launch")).getByText("Planned")).toBeInTheDocument();
    expect(server.opened).toContainEqual(expect.objectContaining({ table: "sprints", sort: ["start_date", "desc"] }));
    const names = screen.getAllByRole("row").slice(1).map((r) => r.querySelector("strong")?.textContent);
    expect(names).toEqual(["Web Launch", "JIR Sprint 2", "JIR Sprint 1"]);
  });

  it("narrows by state on the server", async () => {
    const { server } = renderPage(<Sprints />, { tables });
    await rowOf("JIR Sprint 1");
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    await waitFor(() =>
      expect(server.opened).toContainEqual(expect.objectContaining({ table: "sprints", where: [["state", "in", ["active"]]] })),
    );
    await waitFor(() => expect(screen.queryByText("JIR Sprint 1")).not.toBeInTheDocument());
    expect(screen.getByText("JIR Sprint 2")).toBeInTheDocument();
  });

  it("sorts on the server when a header is clicked", async () => {
    const { server } = renderPage(<Sprints />, { tables });
    await rowOf("JIR Sprint 1");
    fireEvent.click(screen.getByRole("button", { name: "Sprint" }));
    await waitFor(() => expect(server.opened).toContainEqual(expect.objectContaining({ table: "sprints", sort: ["name", "asc"] })));
  });
});

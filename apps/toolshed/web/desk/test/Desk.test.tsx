import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { VantageProvider } from "@vantage-ui/client/react";
import { createTestVantage, type ActionHandler, type MockRunControl } from "@vantage-ui/client/testing";
import { schema, type Schema } from "../src/vantage.gen";
import { ToolList } from "../src/pages/ToolList";

const tools = [
  { id: "1", name: "Wheelbarrow", category: "Moving", status: "available", borrower: null, due_on: null, overdue: false },
  { id: "2", name: "Jigsaw", category: "Power tools", status: "on_loan", borrower: "Marcus Webb", due_on: "2026-10-06", overdue: false },
  { id: "3", name: "Strimmer", category: "Garden", status: "repair", borrower: null, due_on: null, overdue: false },
  { id: "4", name: "Tile cutter", category: "Decorating", status: "on_loan", borrower: "Gareth Lloyd", due_on: "2026-10-01", overdue: false },
];

function setup(actions: Record<string, ActionHandler> = {}) {
  const { db, server } = createTestVantage<Schema>(schema, { tables: { tools }, actions });
  render(
    <VantageProvider db={db}>
      <ToolList />
    </VantageProvider>,
  );
  return { db, server };
}

const rowNames = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[0]?.textContent);

describe("tool list", () => {
  it("asks the server for tools sorted by name and renders them in that order", async () => {
    const { server } = setup();
    expect(await screen.findByText("Jigsaw")).toBeInTheDocument();
    expect(server.opened.at(-1)).toMatchObject({ table: "tools", sort: ["name", "asc"] });
    expect(rowNames()).toEqual(["Jigsaw", "Strimmer", "Tile cutter", "Wheelbarrow"]);
  });

  it("filters by status on the server", async () => {
    const { server } = setup();
    await screen.findByText("Jigsaw");
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "on_loan" } });
    expect(await screen.findByText("2 tools")).toBeInTheDocument();
    expect(server.opened.at(-1)).toMatchObject({ table: "tools", where: [["status", "eq", "on_loan"]] });
    expect(rowNames()).toEqual(["Jigsaw", "Tile cutter"]);
  });
});

describe("check overdue loans", () => {
  it("shows the run's progress and the final count", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const checkOverdue: ActionHandler = async (_, __, run: MockRunControl) => {
      run.update({ total: 2, progress: 0 });
      run.update({ progress: 1, overdue: 1 });
      run.emit("overdue_tool", { name: "Tile cutter", borrower: "Gareth Lloyd", due_on: "2026-10-01" });
      await gate;
      run.update({ progress: 2, overdue: 2 });
      run.emit("overdue_tool", { name: "Jigsaw", borrower: "Marcus Webb", due_on: "2026-10-06" });
      return { overdue: 2, checked: 2, message: "2 tools are overdue" };
    };
    setup({ check_overdue: checkOverdue });
    await screen.findByText("Jigsaw");

    fireEvent.click(screen.getByRole("button", { name: "Check overdue loans" }));
    expect(await screen.findByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check overdue loans" })).toBeDisabled();
    expect(screen.getByLabelText("Checking loans")).toHaveAttribute("value", "1");

    release();
    expect(await screen.findByRole("status")).toHaveTextContent("2 tools are overdue");
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Overdue loans" })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Check overdue loans" })).toBeEnabled();
  });
});

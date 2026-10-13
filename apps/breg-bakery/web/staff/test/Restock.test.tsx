// The restock wizard against a MockServer: pick, review, start, confirm,
// progress, `low_stock` flags and the summary; and a remount (a page reload)
// that follows the same run.
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { VantageProvider } from "@vantage-ui/client/react";
import { MockServer, createTestVantage, type ActionHandler, type Row } from "@vantage-ui/client/testing";
import { Restock } from "../src/restock/Restock";
import { schema, type Schema } from "../src/vantage.gen";
import { BAKERIES } from "./render";

const product = (id: string, name: string, stock: number): Row => ({ id, name, stock, bakery: "bakery:leeds", is_deleted: false, price: 100 });
const PRODUCTS = [product("product:bun", "Iced Bun", 2), product("product:roll", "Sausage Roll", 7), product("product:pie", "Pork Pie", 30)];

/** A restock body: shares `total`, waits for `confirmed`, then works through `gate`. */
function restockBody(gate: Promise<void>): ActionHandler {
  return async (_row, args, run) => {
    const picked = args.products as string[];
    run.set("total", picked.length);
    await run.wait("confirmed");
    run.set("progress", 1);
    await gate;
    run.emit("low_stock", { product: "Iced Bun", stock: 8 });
    run.set("progress", picked.length);
    return { restocked: picked.length, units: picked.length * (args.batch as number), still_low: ["Iced Bun"] };
  };
}

function show(server: MockServer) {
  const { db } = createTestVantage<Schema>(server, { token: "leeds-token" });
  return render(
    <VantageProvider db={db} fallback={<p>Connecting…</p>}>
      <Restock />
    </VantageProvider>,
  );
}

function newServer(gate: Promise<void>) {
  return new MockServer(schema, { tables: { bakery: BAKERIES, product: PRODUCTS }, actions: { "bakery.restock_bakery": restockBody(gate) } });
}

async function startRestock() {
  fireEvent.click(await screen.findByRole("button", { name: "Next" }));
  expect(await screen.findByRole("checkbox", { name: "Iced Bun (2 left)" })).toBeChecked();
  expect(screen.queryByRole("checkbox", { name: /Pork Pie/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Sausage Roll (7 left)" }));
  fireEvent.click(screen.getByRole("button", { name: "Start restock" }));
}

describe("restock", () => {
  it("starts with the ticked products, waits for Confirm, then shows progress, flags and the summary", async () => {
    let open!: () => void;
    const server = newServer(new Promise<void>((resolve) => (open = resolve)));
    show(server);
    await startRestock();
    expect(await screen.findByText("Restock 1 product at Breg Leeds, Briggate?")).toBeInTheDocument();
    expect([...server.runs.values()][0]!.args).toEqual({ products: ["product:bun"], batch: 6 });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("1 of 1 restocked")).toBeInTheDocument();
    open();
    expect(await screen.findByText("Iced Bun is still low: 8 left.")).toBeInTheDocument();
    const summary = await screen.findByText("Restocked 1 product at Breg Leeds, Briggate: 6 units.");
    expect(within(summary.parentElement!).getByText("Still low: Iced Bun.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restock again" }));
    expect(await screen.findByRole("button", { name: "Start restock" })).toBeInTheDocument();
  });

  it("a remount mid-run follows the same run", async () => {
    let open!: () => void;
    const server = newServer(new Promise<void>((resolve) => (open = resolve)));
    const first = show(server);
    await startRestock();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("1 of 1 restocked")).toBeInTheDocument();
    first.unmount();

    show(server);
    expect(await screen.findByText("1 of 1 restocked")).toBeInTheDocument();
    open();
    expect(await screen.findByText("Restocked 1 product at Breg Leeds, Briggate: 6 units.")).toBeInTheDocument();
    expect(server.runs.size).toBe(1);
  });

  it("Cancel stops the run before it bakes", async () => {
    const server = newServer(new Promise<void>(() => {}));
    show(server);
    await startRestock();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Restock cancelled")).toBeInTheDocument();
    expect(screen.getByText("Nothing was restocked.")).toBeInTheDocument();
  });

  it("offers no Confirm until the server has counted the products", async () => {
    let counted!: () => void;
    const counting = new Promise<void>((resolve) => (counted = resolve));
    const server = new MockServer(schema, {
      tables: { bakery: BAKERIES, product: PRODUCTS },
      actions: {
        "bakery.restock_bakery": async (_row, args, run) => {
          await counting;
          return restockBody(Promise.resolve())(_row, args, run);
        },
      },
    });
    show(server);
    await startRestock();
    expect(await screen.findByText("Checking the shelves…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    counted();
    expect(await screen.findByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });
});

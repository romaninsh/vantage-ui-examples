import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VantageProvider } from "@vantage-ui/client/react";
import { createTestVantage } from "@vantage-ui/client/testing";
import { Jobs } from "../src/Jobs";
import { schema, type Schema } from "../src/vantage.gen";

describe("jobs", () => {
  it("without a shop to pick, the shop actions are disabled and say why", async () => {
    // The mock answers every `options` request with no items.
    const { db } = createTestVantage<Schema>(schema, { tables: {} });
    render(
      <VantageProvider db={db}>
        <Jobs />
      </VantageProvider>,
    );
    expect(await screen.findByText("No shops to choose from.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Magic promotion/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Restock ovens/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Chase payments/ })).toBeEnabled();
  });
});

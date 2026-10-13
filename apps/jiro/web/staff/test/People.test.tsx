import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { People } from "../src/pages/People";
import { Person } from "../src/pages/Person";
import { tables } from "./fixtures";
import { renderPage } from "./renderPage";

describe("People", () => {
  it("shows a card per person, in the server's name order, linking to their page", async () => {
    const { server } = renderPage(<People />, { tables });
    const card = within(await screen.findByRole("listitem", { name: "Ana Lopez" }));
    expect(card.getByText("AJL")).toBeInTheDocument();
    expect(card.getByRole("link")).toHaveAttribute("href", "/people/mem-ana");
    expect(server.opened).toContainEqual(expect.objectContaining({ table: "users", sort: ["name", "asc"] }));
  });
});

describe("Person page", () => {
  it("lists the issues assigned to the person, through the person", async () => {
    const { server } = renderPage(<Person />, { tables, path: "/people/mem-ana", route: "/people/:id" });
    expect(await screen.findByRole("heading", { name: "Ana Lopez" })).toBeInTheDocument();
    expect(screen.getByText("Engineering lead")).toBeInTheDocument();
    expect(await screen.findByText("JIR-1")).toBeInTheDocument();
    expect(screen.getByText("WEB-1")).toBeInTheDocument();
    expect(screen.queryByText("JIR-2")).not.toBeInTheDocument();
    expect(server.opened).toContainEqual(expect.objectContaining({ table: "issues", via: { table: "users", id: "mem-ana", ref: "assigned" } }));
  });

  it("says so when there's no such person", async () => {
    renderPage(<Person />, { tables, path: "/people/mem-nobody", route: "/people/:id" });
    expect(await screen.findByText("There's no one with id mem-nobody.")).toBeInTheDocument();
  });
});

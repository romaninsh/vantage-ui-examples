import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { BAKERIES, elapse, renderAt, signIn } from "./render";

// A server that never answers `hello`, as when it is down or unreachable.
const silent = { tables: { bakery: BAKERIES } };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("waiting for the server", () => {
  it("gives up after a while and lets the user try again", async () => {
    const { server } = renderAt("/sign-in", silent, (s) => s.hold("hello"));
    signIn("leeds-token");
    await elapse(1_000);
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    await elapse(10_000);
    expect(screen.getByRole("alert")).toHaveTextContent("Can't reach the server");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    const hellos = server.count("hello");
    await elapse(30_000);
    expect(server.count("hello")).toBe(hellos); // the abandoned client stopped reconnecting
    expect(sessionStorage.getItem("vantage.token")).toBeNull();
  });

  it("cancel abandons the attempt, and a late answer is ignored", async () => {
    const { server } = renderAt("/sign-in", silent, (s) => s.hold("hello"));
    signIn("leeds-token");
    await elapse(100);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    act(() => server.release("hello"));
    await elapse(30_000);
    expect(screen.getByTestId("path")).toHaveTextContent("/sign-in");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(sessionStorage.getItem("vantage.token")).toBeNull();
  });

  it("leaving the page mid-wait saves nothing later", async () => {
    const { server, unmount } = renderAt("/sign-in", silent, (s) => s.hold("hello"));
    signIn("leeds-token");
    await elapse(100);
    unmount();
    server.release("hello");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sessionStorage.getItem("vantage.token")).toBeNull();
  });

  it("a returning user can sign out while the server is unreachable", async () => {
    sessionStorage.setItem("vantage.token", "leeds-token");
    const { forget } = renderAt("/", silent, (s) => s.hold("hello"));
    await elapse(1_000);
    expect(screen.getByText(/Connecting…/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/sign-in");
    expect(sessionStorage.getItem("vantage.token")).toBeNull();
    expect(forget).toHaveBeenCalledWith("leeds-token");
  });
});

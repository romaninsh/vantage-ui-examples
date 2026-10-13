import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { BAKERIES, elapse, renderAt, signIn } from "./render";

// Long enough to cover several reconnect backoffs (the first is 200 ms).
const PAST_RECONNECTS = 30_000;

afterEach(() => {
  vi.useRealTimers();
});

describe("placeholder sign-in", () => {
  it("says it is a placeholder", () => {
    renderAt("/sign-in", { tables: { bakery: BAKERIES } });
    expect(screen.getByText(/Placeholder sign-in: paste a test-profile token\. Real sign-in comes later\./)).toBeInTheDocument();
  });

  it("bad token stays on sign in and never retries", async () => {
    vi.useFakeTimers();
    const { server } = renderAt("/sign-in", { refuseHello: "unknown token" });
    signIn("nope");
    await elapse(PAST_RECONNECTS);
    expect(screen.getByRole("alert")).toHaveTextContent("unknown token");
    expect(screen.getByTestId("path")).toHaveTextContent("/sign-in");
    expect(server.hellos).toHaveLength(1);
    expect(sessionStorage.getItem("vantage.token")).toBeNull();
  });

  it("a good token opens the app and is kept for the session", async () => {
    renderAt("/sign-in", { tables: { bakery: BAKERIES } });
    signIn("leeds-token");
    expect(await screen.findByRole("button", { name: /Undo/ })).toBeInTheDocument();
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
    expect(sessionStorage.getItem("vantage.token")).toBe("leeds-token");
  });

  it("sends a visitor without a token to sign in", () => {
    const { server } = renderAt("/", { tables: { bakery: BAKERIES } });
    expect(screen.getByTestId("path")).toHaveTextContent("/sign-in");
    expect(server.hellos).toHaveLength(0);
  });

  it("sends a signed-in visitor away from sign in", async () => {
    sessionStorage.setItem("vantage.token", "leeds-token");
    renderAt("/sign-in", { tables: { bakery: BAKERIES } });
    expect(await screen.findByRole("button", { name: /Undo/ })).toBeInTheDocument();
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
  });

  it("routes a refused stored token to sign in with the server's message, once", async () => {
    vi.useFakeTimers();
    sessionStorage.setItem("vantage.token", "expired");
    const { server } = renderAt("/", { refuseHello: "unknown token" });
    await elapse(PAST_RECONNECTS);
    expect(screen.getByRole("alert")).toHaveTextContent("unknown token");
    expect(screen.getByTestId("path")).toHaveTextContent("/sign-in");
    expect(server.hellos).toHaveLength(1);
    expect(sessionStorage.getItem("vantage.token")).toBeNull();
  });

  it("sign out clears the token and wipes the principal's stored rows", async () => {
    sessionStorage.setItem("vantage.token", "leeds-token");
    const { forget } = renderAt("/", { tables: { bakery: BAKERIES } });
    await screen.findByRole("button", { name: /Undo/ });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/sign-in");
    expect(sessionStorage.getItem("vantage.token")).toBeNull();
    expect(forget).toHaveBeenCalledWith("leeds-token");
  });
});

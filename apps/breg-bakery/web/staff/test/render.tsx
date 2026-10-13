import { vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { MockServer, createTestVantage, type Fixtures } from "@vantage-ui/client/testing";
import { Root } from "../src/Root";
import { schema, type Schema } from "../src/vantage.gen";

export const BAKERIES = [{ id: "bakery:leeds", name: "Breg Leeds, Briggate", profit_margin: 30 }];

function Path() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

/** Renders the app at `path` against a MockServer; `forget` records wiped principals. */
export function renderAt(path: string, fixtures: Fixtures, prepare?: (server: MockServer) => void) {
  const server = new MockServer(schema, fixtures);
  prepare?.(server);
  const connect = (token: string) => createTestVantage<Schema>(server, { token }).db;
  const forget = vi.fn();
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Root connect={connect} forget={forget} />
      <Path />
    </MemoryRouter>,
  );
  return { server, forget, unmount: view.unmount };
}

export function signIn(token: string) {
  fireEvent.change(screen.getByLabelText("Token"), { target: { value: token } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

/** Advances fake timers by `ms`, letting React and the client's microtasks run. */
export async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

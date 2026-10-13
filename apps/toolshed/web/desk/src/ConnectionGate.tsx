import type { ReactNode } from "react";
import { useConnection } from "@vantage-ui/client/react";

export function ConnectionGate({ children }: { children?: ReactNode }) {
  const { status, error } = useConnection();
  if (status === "refused") return <p role="alert">Sign-in refused: {error}</p>;
  if (status === "protocol_mismatch") return <p role="alert">This page is out of date. Reload it. ({error})</p>;
  return children ?? <p>Connecting…</p>;
}

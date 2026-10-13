// The connection to the API, as the shell shows it: a lozenge in the top bar
// while connecting, and a banner once the server has refused for good.
import Banner from "@atlaskit/banner";
import Lozenge from "@atlaskit/lozenge";
import { useConnection } from "@vantage-ui/client/react";

export function ConnectionLozenge() {
  const { status, halted } = useConnection();
  if (status === "open" || halted) return null;
  return <Lozenge appearance="moved">{status === "connecting" ? "Connecting" : "Reconnecting"}</Lozenge>;
}

/** Whether the connection banner shows, so the layout can make room for it. */
export function useConnectionRefused() {
  return useConnection().halted;
}

export function ConnectionBanner() {
  const { status, halted, error } = useConnection();
  if (!halted) return null;
  const what = status === "refused" ? "The server refused this connection" : "This page is out of date with the server";
  return (
    <Banner appearance="error">
      {what}
      {error ? `: ${error}` : "."}
    </Banner>
  );
}

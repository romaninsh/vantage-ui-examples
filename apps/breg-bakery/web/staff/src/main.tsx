import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { createVantage } from "@vantage-ui/client";
import { Root } from "./Root";
import { PrincipalStorage } from "./storage";
import { schema, type Schema } from "./vantage.gen";
import "./style.css";

// The API serves this page, so the client connects back to the same origin.
// Tables marked `persist: true` paint from IndexedDB before the socket
// connects, from a database of the token's own.
const connect = (token: string) => createVantage<Schema>({ schema, token, storage: new PrincipalStorage(token, schema.hash) });

// Signing out wipes those rows.
const forget = (token: string) =>
  void new PrincipalStorage(token, schema.hash).clear().catch((e) => console.warn("breg: could not wipe stored rows", e));

// No StrictMode: its double render would open a second connection.
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Root connect={connect} forget={forget} />
  </BrowserRouter>,
);

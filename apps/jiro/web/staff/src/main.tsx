import "@atlaskit/css-reset";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { createVantage } from "@vantage-ui/client";
import { VantageProvider } from "@vantage-ui/client/react";
import { App } from "./App";
import { schema, type Schema } from "./vantage.gen";

// The API serves this page, so the client connects back to the same origin.
const db = createVantage<Schema>({ schema });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VantageProvider db={db}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </VantageProvider>
  </StrictMode>,
);

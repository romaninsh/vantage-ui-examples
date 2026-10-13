import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { createVantage } from "@vantage-ui/client";
import { VantageProvider } from "@vantage-ui/client/react";
import { schema, type Schema } from "./vantage.gen";
import { ConnectionGate } from "./ConnectionGate";
import { ToolList } from "./pages/ToolList";

const db = createVantage<Schema>({ schema });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VantageProvider db={db} fallback={<ConnectionGate />}>
      <ConnectionGate>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ToolList />} />
          </Routes>
        </BrowserRouter>
      </ConnectionGate>
    </VantageProvider>
  </StrictMode>,
);

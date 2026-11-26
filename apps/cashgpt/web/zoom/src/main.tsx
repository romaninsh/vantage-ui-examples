import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createVantage } from "@vantage-ui/client";
import { VantageProvider } from "@vantage-ui/client/react";
import { schema, type Schema } from "./vantage.gen";
import { ConnectionGate } from "./ConnectionGate";
import { Explorer } from "./Explorer";
import { useDb } from "./db";
import { loadLicense } from "./license";
import "./styles.css";

const db = createVantage<Schema>({ schema });

/** Charts wait for the licence answer, since ZoomCharts reads it when a chart is created. */
function Licensed() {
  const db = useDb();
  const [licensed, setLicensed] = useState<boolean | null>(null);
  useEffect(() => {
    loadLicense(db).then(setLicensed);
  }, [db]);
  if (licensed === null) return <p className="connecting">Loading…</p>;
  if (!window.ZoomCharts) return <p role="alert">The ZoomCharts library didn't load from its CDN. Check the network and reload.</p>;
  return <Explorer licensed={licensed} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VantageProvider db={db} fallback={<ConnectionGate />}>
      <ConnectionGate>
        <Licensed />
      </ConnectionGate>
    </VantageProvider>
  </StrictMode>,
);

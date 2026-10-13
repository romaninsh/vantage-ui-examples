import { useVantage } from "@vantage-ui/client/react";
import type { Schema } from "./vantage.gen";

/** The typed client for the jiro staff API. */
export const useDb = () => useVantage<Schema>();

import { useVantage } from "@vantage-ui/client/react";
import type { Schema } from "./vantage.gen";

export const useDb = () => useVantage<Schema>();

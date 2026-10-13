import { useVantage } from "@vantage-ui/client/react";
import type { VantageDb } from "@vantage-ui/client";
import type { Schema } from "./vantage.gen";

export type Db = VantageDb<Schema>;

/** Opens a client signed in with `token`. */
export type Connect = (token: string) => Db;

/** Wipes what the client stored for `token`'s principal. */
export type Forget = (token: string) => void;

/** The typed client for the breg staff API. */
export const useDb = () => useVantage<Schema>();

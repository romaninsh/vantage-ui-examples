import type { UsersFields } from "../vantage.gen";

/** Team names as the directory shows them; typed against the API's enum. */
export const TEAM_LABELS: Record<NonNullable<UsersFields["team"]>, string> = {
  platform: "Platform",
  mobile: "Mobile",
  design: "Design",
  product: "Product",
};

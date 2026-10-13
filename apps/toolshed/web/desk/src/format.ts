import type { ToolsFields } from "./vantage.gen";

type Status = NonNullable<ToolsFields["status"]>;

export const STATUS_LABELS: Record<Status, string> = {
  available: "Available",
  on_loan: "On loan",
  repair: "In repair",
};

export function statusLabel(status: ToolsFields["status"]): string {
  return status ? STATUS_LABELS[status] : "";
}

/** "2026-10-06" (or an RFC 3339 stamp from a desktop form) → "6 Oct 2026". */
export function formatDate(value: string | null): string {
  if (!value) return "";
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function overdueMessage(count: number): string {
  return count === 1 ? "1 tool is overdue" : `${count} tools are overdue`;
}

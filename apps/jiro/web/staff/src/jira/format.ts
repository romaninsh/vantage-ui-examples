const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** "Oct 14, 2026", or "" for no date. */
export const formatDate = (value: string | null | undefined) => (value ? dateFormat.format(new Date(value)) : "");

/** "Oct 14, 2026, 9:30 AM", or "" for no timestamp. */
export const formatDateTime = (value: string | null | undefined) => (value ? dateTimeFormat.format(new Date(value)) : "");

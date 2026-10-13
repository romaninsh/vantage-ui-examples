/**
 * The page of an issue: by key ("/issues/JIR-12"), or by id for an issue
 * that has no key yet (one just made in the Create dialog).
 */
export const issueHref = (issue: { id: string; key: string | null }) => `/issues/${encodeURIComponent(issue.key ?? issue.id)}`;

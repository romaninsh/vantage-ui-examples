// The issue enums in the API's order (from the generated schema), with the
// labels Jira shows for them. The label maps are typed against the generated
// unions, so a value added to the API fails the type check until it has one.
import { schema, type IssuesFields } from "../vantage.gen";

export type IssueStatus = NonNullable<IssuesFields["status"]>;
export type IssueType = NonNullable<IssuesFields["type"]>;
export type IssuePriority = NonNullable<IssuesFields["priority"]>;

const issues = schema.tables.issues;

export const STATUSES: readonly IssueStatus[] = issues.columns.status.enum;
export const TYPES: readonly IssueType[] = issues.columns.type.enum;
/** Highest first. */
export const PRIORITIES: readonly IssuePriority[] = issues.columns.priority.enum;

export const STATUS_LABELS: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  wont_do: "Won't Do",
};

export const TYPE_LABELS: Record<IssueType, string> = {
  epic: "Epic",
  story: "Story",
  task: "Task",
  bug: "Bug",
  "sub-task": "Subtask",
};

export const PRIORITY_LABELS: Record<IssuePriority, string> = {
  highest: "Highest",
  high: "High",
  medium: "Medium",
  low: "Low",
  lowest: "Lowest",
};

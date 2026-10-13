import { STATUSES, type IssueStatus } from "../jira/issueFields";

/** The board's columns: every issue status, in the API's enum order. */
export function boardColumns(): readonly IssueStatus[] {
  return STATUSES;
}

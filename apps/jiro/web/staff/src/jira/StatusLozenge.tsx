// Jira's status categories: to-do grey, in-progress blue, done green.
// "Won't do" is a resolution, so it sits in the done category.
import Lozenge, { type ThemeAppearance } from "@atlaskit/lozenge";
import { STATUS_LABELS, type IssueStatus } from "./issueFields";

const APPEARANCE: Record<IssueStatus, ThemeAppearance> = {
  backlog: "default",
  todo: "default",
  in_progress: "inprogress",
  in_review: "inprogress",
  done: "success",
  wont_do: "success",
};

export function StatusLozenge({ status }: { status: IssueStatus | null }) {
  if (!status) return null;
  return <Lozenge appearance={APPEARANCE[status]}>{STATUS_LABELS[status]}</Lozenge>;
}

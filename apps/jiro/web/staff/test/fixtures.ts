// A small jiro: two projects, three people, issues across both projects,
// sprints in each state, and comments on two issues.
import type { Row } from "@vantage-ui/client/testing";

export const projects: Row[] = [
  { id: "prj-jir", key: "JIR", name: "Jiro Core", client: "Acme", status: "active", lead: "mem-ana", lead_name: "Ana Lopez" },
  { id: "prj-web", key: "WEB", name: "Website", client: "Globex", status: "archived", lead: "mem-ben", lead_name: "Ben Ito" },
];

export const users: Row[] = [
  { id: "mem-ana", name: "Ana Lopez", initials: "AJL", role: "Engineering lead", team: "platform", active: true },
  { id: "mem-ben", name: "Ben Ito", initials: "BI", role: "Designer", team: "design", active: true },
  { id: "mem-cy", name: "Cy Moss", initials: "CM", role: "Product manager", team: "product", active: false },
];

export const issues: Row[] = [
  { id: "iss-1", key: "JIR-1", title: "Login fails on Safari", type: "bug", status: "todo", priority: "high", project: "prj-jir", project_key: "JIR", assignee: "mem-ana", assignee_name: "Ana Lopez" },
  { id: "iss-2", key: "JIR-2", title: "Drag cards between columns", type: "story", status: "in_progress", priority: "medium", project: "prj-jir", project_key: "JIR", assignee: "mem-ben", assignee_name: "Ben Ito" },
  { id: "iss-3", key: "WEB-1", title: "New landing page", type: "task", status: "done", priority: "low", project: "prj-web", project_key: "WEB", assignee: "mem-ana", assignee_name: "Ana Lopez" },
];

export const sprints: Row[] = [
  { id: "spr-1", name: "JIR Sprint 1", state: "closed", project: "prj-jir", start_date: "2026-08-01", end_date: "2026-08-14" },
  { id: "spr-2", name: "JIR Sprint 2", state: "active", project: "prj-jir", start_date: "2026-08-15", end_date: "2026-08-28" },
  { id: "spr-3", name: "Web Launch", state: "planned", project: "prj-web", start_date: "2026-09-01", end_date: "2026-09-14" },
];

export const comments: Row[] = [
  { id: "cmt-1", issue: "iss-1", author: "mem-ben", author_name: "Ben Ito", body: "Seen on Safari 17 too.", created_at: "2026-09-01T10:00:00Z" },
  { id: "cmt-2", issue: "iss-2", author: "mem-ana", author_name: "Ana Lopez", body: "Moving this to review tomorrow.", created_at: "2026-09-02T09:30:00Z" },
];

export const tables = { projects, users, issues, sprints, comments };

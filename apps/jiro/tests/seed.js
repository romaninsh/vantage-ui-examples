// tests/seed.js — Jiro, Kestrel Labs issue tracker. Re-runnable: drops and recreates.
// String ids and string references throughout, so every relation and dropdown works.
// Display names are denormalised onto issues (assignee_name, project_key, …) because
// MongoDB tables can't carry dotted/related columns; the FK id columns stay for editing.

const COLLS = ["member", "project", "sprint", "version", "issue", "comment", "worklog", "watcher", "issue_link"];
for (const c of COLLS) db.getCollection(c).drop();

// ---------------------------------------------------------------- people
const members = [
  { _id: "mem-ana",    name: "Ana Kovač",        initials: "AK", role: "Engineering Lead",      team: "platform", email: "ana@kestrel.dev",    capacity: 24, active: true,
    bio: "Runs the Platform team. Twelve years in distributed systems; keeps the deploy pipeline honest." },
  { _id: "mem-ben",    name: "Ben Carter",       initials: "BC", role: "Senior Backend Engineer", team: "platform", email: "ben@kestrel.dev",    capacity: 32, active: true,
    bio: "Payments and ledgers. Wrote most of Harbor's double-entry core. Allergic to flaky tests." },
  { _id: "mem-dmitri", name: "Dmitri Volkov",    initials: "DV", role: "Backend Engineer",       team: "platform", email: "dmitri@kestrel.dev", capacity: 34, active: true,
    bio: "API and infrastructure. Happiest tuning Postgres and arguing about idempotency keys." },
  { _id: "mem-nadia",  name: "Nadia Haddad",     initials: "NH", role: "Full-stack Engineer",    team: "platform", email: "nadia@kestrel.dev", capacity: 30, active: true,
    bio: "Moves between web and services. Shipped the Kestrel Website rebuild single-handed." },
  { _id: "mem-fatima", name: "Fatima Al-Rashid", initials: "FA", role: "Mobile Lead",            team: "mobile",   email: "fatima@kestrel.dev", capacity: 22, active: true,
    bio: "Leads Mobile. Obsessive about startup time and 60fps lists. Owns the Northwind app." },
  { _id: "mem-hana",   name: "Hana Sato",        initials: "HS", role: "iOS Engineer",           team: "mobile",   email: "hana@kestrel.dev",   capacity: 34, active: true,
    bio: "Swift and SwiftUI. Turns Lena's designs into pixel-perfect screens." },
  { _id: "mem-ivan",   name: "Ivan Petrov",      initials: "IP", role: "Android Engineer",       team: "mobile",   email: "ivan@kestrel.dev",   capacity: 32, active: true,
    bio: "Kotlin and Compose. Hunts jank on low-end devices for sport." },
  { _id: "mem-lena",   name: "Lena Fischer",     initials: "LF", role: "Design Lead",            team: "design",   email: "lena@kestrel.dev",   capacity: 20, active: true,
    bio: "Design lead across every product. Owns the Kestrel design system and the website look." },
  { _id: "mem-marco",  name: "Marco Rossi",      initials: "MR", role: "Product Manager",        team: "product",  email: "marco@kestrel.dev",  capacity: 16, active: true,
    bio: "Product manager. Keeps clients happy and backlogs ruthless. Writes the roadmaps nobody reads." },
];
db.member.insertMany(members);

// ---------------------------------------------------------------- projects
const projects = [
  { _id: "proj-book",   key: "BOOK",   name: "Northwind Booking App", client: "Northwind Travel", status: "active",
    lead: "mem-fatima", description: "iOS and Android travel-booking app for Northwind Travel — search, book and manage trips." },
  { _id: "proj-deploy", key: "DEPLOY", name: "Kestrel Deploy",        client: "Kestrel Labs (internal)", status: "active",
    lead: "mem-ana",    description: "Our in-house CI/CD and release tool. Pipelines, secrets, rollbacks and deploy observability." },
  { _id: "proj-web",    key: "WEB",    name: "Kestrel Website",       client: "Kestrel Labs (internal)", status: "active",
    lead: "mem-lena",   description: "The kestrel.dev marketing site — redesign, careers and the engineering blog." },
  { _id: "proj-pay",    key: "PAY",    name: "Harbor Payments",       client: "Harbor Fintech", status: "archived",
    lead: "mem-ben",    description: "Payments platform for Harbor Fintech. First engagement shipped and handed over; archived." },
];
const memberName = Object.fromEntries(members.map(m => [m._id, m.name]));
projects.forEach(p => { p.lead_name = memberName[p.lead]; });
db.project.insertMany(projects);
const projById = Object.fromEntries(projects.map(p => [p._id, p]));

// ---------------------------------------------------------------- sprints
const D = (s) => ISODate(s);
const sprints = [
  { _id: "spr-book-6", project: "proj-book",   name: "BOOK Sprint 6",  state: "closed",  goal: "Search polish and the map view",            start_date: D("2026-08-18T00:00:00Z"), end_date: D("2026-09-01T00:00:00Z") },
  { _id: "spr-book-7", project: "proj-book",   name: "BOOK Sprint 7",  state: "active",  goal: "Checkout flow end to end",                  start_date: D("2026-09-29T00:00:00Z"), end_date: D("2026-10-13T00:00:00Z") },
  { _id: "spr-book-8", project: "proj-book",   name: "BOOK Sprint 8",  state: "planned", goal: "Loyalty points and offline itineraries",    start_date: D("2026-10-13T00:00:00Z"), end_date: D("2026-10-27T00:00:00Z") },
  { _id: "spr-dep-2",  project: "proj-deploy", name: "Deploy Sprint 2", state: "closed", goal: "Secrets at rest and audit log",             start_date: D("2026-09-01T00:00:00Z"), end_date: D("2026-09-15T00:00:00Z") },
  { _id: "spr-dep-3",  project: "proj-deploy", name: "Deploy Sprint 3", state: "active", goal: "Rollback and canary deploys",               start_date: D("2026-09-29T00:00:00Z"), end_date: D("2026-10-13T00:00:00Z") },
  { _id: "spr-web-1",  project: "proj-web",    name: "Web Launch",      state: "active", goal: "Ship the redesigned marketing site",        start_date: D("2026-09-22T00:00:00Z"), end_date: D("2026-10-20T00:00:00Z") },
  { _id: "spr-pay-ga", project: "proj-pay",    name: "Payments GA",     state: "closed", goal: "General availability and PCI sign-off",     start_date: D("2026-06-02T00:00:00Z"), end_date: D("2026-06-30T00:00:00Z") },
];
sprints.forEach(s => { s.project_key = projById[s.project].key; });
db.sprint.insertMany(sprints);
const sprintName = Object.fromEntries(sprints.map(s => [s._id, s.name]));

// ---------------------------------------------------------------- versions
const versions = [
  { _id: "ver-book-100", project: "proj-book",   name: "1.0.0", released: true,  release_date: D("2026-07-15T00:00:00Z"), description: "First public release of the Northwind app." },
  { _id: "ver-book-110", project: "proj-book",   name: "1.1.0", released: true,  release_date: D("2026-09-02T00:00:00Z"), description: "Map view and search filters." },
  { _id: "ver-book-120", project: "proj-book",   name: "1.2.0", released: false, release_date: D("2026-10-27T00:00:00Z"), description: "Checkout, loyalty and offline itineraries." },
  { _id: "ver-dep-040",  project: "proj-deploy", name: "0.4.0", released: true,  release_date: D("2026-09-16T00:00:00Z"), description: "Secrets management and audit log." },
  { _id: "ver-dep-050",  project: "proj-deploy", name: "0.5.0", released: false, release_date: D("2026-10-14T00:00:00Z"), description: "Rollback, canary and blue/green." },
  { _id: "ver-web-200",  project: "proj-web",    name: "2.0.0", released: false, release_date: D("2026-10-20T00:00:00Z"), description: "Full marketing-site redesign." },
  { _id: "ver-pay-100",  project: "proj-pay",    name: "1.0.0", released: true,  release_date: D("2026-06-30T00:00:00Z"), description: "GA release handed to Harbor." },
];
versions.forEach(v => { v.project_key = projById[v.project].key; });
db.getCollection("version").insertMany(versions);
const versionName = Object.fromEntries(versions.map(v => [v._id, v.name]));

// ---------------------------------------------------------------- issues
// Helpers for round-robin distribution without randomness (reproducible seed).
let seq = 0;              // global issue number -> _id iss-0001
const perProjectCounter = {};
const issues = [];
const parentKeyById = {};

function mkIssue(o) {
  seq += 1;
  const p = projById[o.project];
  perProjectCounter[o.project] = (perProjectCounter[o.project] || 0) + 1;
  const num = perProjectCounter[o.project];
  const key = `${p.key}-${num}`;
  const _id = `iss-${String(seq).padStart(4, "0")}`;
  const created = o.created_at || D("2026-08-01T09:00:00Z");
  const updated = o.updated_at || created;
  const doc = {
    _id, key,
    project: o.project, project_key: p.key,
    type: o.type,
    parent: o.parent || null,
    parent_key: o.parent ? parentKeyById[o.parent] : null,
    title: o.title,
    description: o.description || "",
    status: o.status,
    priority: o.priority,
    assignee: o.assignee || null, assignee_name: o.assignee ? memberName[o.assignee] : null,
    reporter: o.reporter, reporter_name: memberName[o.reporter],
    estimate: (o.estimate === undefined ? null : o.estimate),
    due_date: o.due_date || null,
    labels: o.labels || "",
    component: o.component || null,
    sprint: o.sprint || null, sprint_name: o.sprint ? sprintName[o.sprint] : null,
    fix_version: o.fix_version || null, version_name: o.fix_version ? versionName[o.fix_version] : null,
    rank: seq * 10,
    created_at: created,
    updated_at: updated,
  };
  if (o.type === "epic") parentKeyById[_id] = key;
  issues.push(doc);
  return _id;
}

const STATUSES = ["backlog", "todo", "in_progress", "in_review", "done", "wont_do"];
const PRIOS = ["highest", "high", "medium", "low", "lowest"];
function rot(arr, i) { return arr[i % arr.length]; }

// Build each project's issues: a handful of epics, then stories/tasks/bugs under them,
// then a sprinkle of sub-tasks. Distribution of status/priority/assignee is round-robin.
function buildProject(projId, cfg) {
  const epicIds = [];
  cfg.epics.forEach((etitle, ei) => {
    const id = mkIssue({
      project: projId, type: "epic", title: etitle,
      description: `Epic: ${etitle}. Tracks the work needed to deliver this capability.`,
      status: cfg.epicStatus ? cfg.epicStatus(ei) : rot(["in_progress", "in_progress", "done", "todo"], ei),
      priority: rot(["high", "medium", "high", "medium"], ei),
      reporter: cfg.pm, assignee: cfg.lead,
      component: cfg.components ? rot(cfg.components, ei) : null,
      created_at: D("2026-07-20T09:00:00Z"),
    });
    epicIds.push(id);
  });

  cfg.items.forEach((it, i) => {
    const epic = epicIds[it.epic != null ? it.epic : (i % epicIds.length)];
    const status = it.status || rot(cfg.statuses || STATUSES, i);
    const assignee = it.assignee || rot(cfg.assignees, i);
    const created = it.created || D(`2026-09-${String((i % 27) + 1).padStart(2, "0")}T10:00:00Z`);
    const id = mkIssue({
      project: projId, type: it.type || "story", title: it.title,
      description: it.description || defaultDesc(it.type || "story", it.title),
      status, priority: it.priority || rot(PRIOS, i + 1),
      assignee, reporter: it.reporter || cfg.pm,
      estimate: it.estimate !== undefined ? it.estimate : rot([1, 2, 3, 5, 8, 5, 3, 2], i),
      parent: epic, component: it.component || (cfg.components ? rot(cfg.components, i) : null),
      sprint: it.sprint !== undefined ? it.sprint : (cfg.sprintFor ? cfg.sprintFor(status, i) : null),
      fix_version: it.fix_version !== undefined ? it.fix_version : (cfg.versionFor ? cfg.versionFor(status, i) : null),
      labels: it.labels || (cfg.labelsFor ? cfg.labelsFor(it.type || "story", i) : ""),
      due_date: it.due_date || null,
      created_at: created, updated_at: it.updated || created,
    });
    // Some stories/tasks get a couple of sub-tasks.
    if (it.subtasks) {
      it.subtasks.forEach((st, si) => {
        mkIssue({
          project: projId, type: "sub-task", title: st,
          description: `Sub-task of ${it.title}.`,
          status: cfg.subtaskStatus ? cfg.subtaskStatus(status) : rot(["todo", "in_progress", "done", "in_review"], si + i),
          priority: it.priority || "medium",
          assignee: rot(cfg.assignees, si + i), reporter: assignee,
          estimate: rot([1, 2, 3], si), parent: id, component: it.component || null,
          sprint: it.sprint !== undefined ? it.sprint : (cfg.sprintFor ? cfg.sprintFor(status, i) : null),
          created_at: created,
        });
      });
    }
  });
}

function defaultDesc(type, title) {
  if (type === "bug") return `Reported in the field: ${title}. Steps to reproduce attached; needs triage and a fix with a regression test.`;
  if (type === "task") return `${title}. Engineering task — no user-facing behaviour change on its own.`;
  return `As a user, I want ${title.charAt(0).toLowerCase() + title.slice(1)} so the product feels complete.`;
}

// ---- BOOK: Northwind Booking App (mobile) ----
buildProject("proj-book", {
  lead: "mem-fatima", pm: "mem-marco",
  assignees: ["mem-fatima", "mem-hana", "mem-ivan", "mem-lena"],
  components: ["search", "booking", "profile", "ios", "android", "design"],
  epics: ["Trip search & discovery", "Booking & checkout flow", "Traveler profiles & loyalty", "Offline itinerary access"],
  statuses: STATUSES,
  sprintFor: (status, i) => {
    if (status === "done") return rot(["spr-book-6", "spr-book-7", null], i);
    if (status === "in_progress" || status === "in_review" || status === "todo") return "spr-book-7";
    if (status === "backlog") return rot(["spr-book-8", null, null], i);
    return null;
  },
  versionFor: (status, i) => status === "done" ? rot(["ver-book-110", "ver-book-100", "ver-book-120"], i) : (status === "in_review" || status === "in_progress" ? "ver-book-120" : null),
  labelsFor: (type, i) => type === "bug" ? rot(["regression,ios", "crash", "perf,android", "ux"], i) : rot(["frontend", "api,frontend", "design", "needs-qa", ""], i),
  items: [
    { epic: 0, type: "story", title: "Search hotels by city and date range", status: "done", assignee: "mem-fatima", estimate: 5, subtasks: ["Build the search request model", "Debounce the search input"] },
    { epic: 0, type: "story", title: "Filter results by price, rating and amenities", status: "done", assignee: "mem-ivan", estimate: 5 },
    { epic: 0, type: "story", title: "Map view for search results", status: "done", assignee: "mem-hana", estimate: 8, subtasks: ["Cluster pins at low zoom", "Sync map and list selection"] },
    { epic: 0, type: "story", title: "Hotel detail page with photo gallery", status: "in_review", assignee: "mem-hana", estimate: 5 },
    { epic: 0, type: "task", title: "Add skeleton loaders to search results", status: "in_progress", assignee: "mem-ivan", estimate: 2 },
    { epic: 0, type: "bug", title: "Crash on iOS 17 when opening the photo gallery", status: "in_progress", priority: "highest", assignee: "mem-hana", estimate: 3 },
    { epic: 0, type: "bug", title: "Date picker allows selecting dates in the past", status: "todo", priority: "high", assignee: "mem-ivan", estimate: 2 },
    { epic: 0, type: "bug", title: "Slow search on low-end Android devices", status: "backlog", priority: "medium", assignee: "mem-ivan", estimate: 5 },
    { epic: 1, type: "story", title: "Multi-room booking support", status: "in_progress", assignee: "mem-fatima", estimate: 8, subtasks: ["Room-and-guest selector UI", "Validate availability per room"] },
    { epic: 1, type: "story", title: "Apply promo codes at checkout", status: "in_progress", assignee: "mem-hana", estimate: 3 },
    { epic: 1, type: "story", title: "Save payment cards securely", status: "todo", assignee: "mem-fatima", estimate: 5, priority: "high" },
    { epic: 1, type: "story", title: "Guest checkout without an account", status: "todo", assignee: "mem-ivan", estimate: 5 },
    { epic: 1, type: "story", title: "Booking confirmation email and receipt", status: "backlog", assignee: "mem-fatima", estimate: 3 },
    { epic: 1, type: "bug", title: "Promo code field rejects valid uppercase codes", status: "in_review", priority: "high", assignee: "mem-hana", estimate: 2 },
    { epic: 1, type: "bug", title: "Checkout total ignores city tax in some regions", status: "todo", priority: "high", assignee: "mem-fatima", estimate: 3 },
    { epic: 2, type: "story", title: "Edit traveler profile and preferences", status: "done", assignee: "mem-ivan", estimate: 3 },
    { epic: 2, type: "story", title: "Traveler loyalty points balance", status: "backlog", assignee: "mem-hana", estimate: 5 },
    { epic: 2, type: "story", title: "Redeem loyalty points for discounts", status: "backlog", assignee: "mem-fatima", estimate: 8 },
    { epic: 2, type: "task", title: "Localise the app into French and German", status: "backlog", assignee: "mem-lena", estimate: 8 },
    { epic: 2, type: "bug", title: "Profile avatar upload fails over cellular", status: "wont_do", priority: "low", assignee: "mem-ivan", estimate: 2 },
    { epic: 3, type: "story", title: "Download itinerary as a PDF", status: "todo", assignee: "mem-hana", estimate: 3 },
    { epic: 3, type: "story", title: "Offline access to upcoming trips", status: "backlog", assignee: "mem-ivan", estimate: 8, priority: "high" },
    { epic: 3, type: "story", title: "Push notification on booking status change", status: "in_progress", assignee: "mem-fatima", estimate: 5 },
    { epic: 3, type: "task", title: "Cache itinerary images for offline use", status: "backlog", assignee: "mem-ivan", estimate: 3 },
    { epic: 0, type: "story", title: "Recent and saved searches", status: "backlog", assignee: "mem-hana", estimate: 3 },
    { epic: 1, type: "task", title: "Instrument checkout funnel analytics", status: "todo", assignee: "mem-fatima", estimate: 2 },
    { epic: 2, type: "bug", title: "Preferred currency resets after sign-out", status: "todo", priority: "medium", assignee: "mem-ivan", estimate: 2 },
    { epic: 3, type: "bug", title: "Offline banner stays up after reconnect", status: "backlog", priority: "low", assignee: "mem-ivan", estimate: 1 },
    { epic: 0, type: "story", title: "Sort search results by distance from the traveler", status: "backlog", assignee: "mem-hana", estimate: 3 },
    { epic: 0, type: "task", title: "A/B test the search result card layout", status: "backlog", assignee: "mem-fatima", estimate: 2 },
    { epic: 1, type: "story", title: "Apple Pay and Google Pay at checkout", status: "backlog", assignee: "mem-hana", estimate: 8, priority: "high" },
    { epic: 1, type: "story", title: "Split payment across two cards", status: "backlog", assignee: "mem-fatima", estimate: 5 },
    { epic: 1, type: "bug", title: "Back button during payment double-charges", status: "todo", priority: "highest", assignee: "mem-fatima", estimate: 3, labels: "payments" },
    { epic: 2, type: "task", title: "Right-to-left layout for Arabic", status: "backlog", assignee: "mem-lena", estimate: 5 },
    { epic: 2, type: "story", title: "Share a trip with a travel companion", status: "backlog", assignee: "mem-ivan", estimate: 5 },
    { epic: 3, type: "story", title: "Add trips to the device calendar", status: "todo", assignee: "mem-hana", estimate: 3 },
    { epic: 3, type: "bug", title: "Itinerary times shown in the wrong timezone", status: "in_progress", priority: "high", assignee: "mem-hana", estimate: 3 },
    { epic: 0, type: "task", title: "Accessibility pass on the search screen", status: "in_review", assignee: "mem-lena", estimate: 3 },
    { epic: 1, type: "task", title: "Handle expired payment session gracefully", status: "todo", assignee: "mem-ivan", estimate: 2 },
    { epic: 2, type: "bug", title: "Loyalty tier badge wrong after upgrade", status: "backlog", priority: "low", assignee: "mem-hana", estimate: 2 },
  ],
});

// ---- DEPLOY: Kestrel Deploy (internal CI/CD) ----
buildProject("proj-deploy", {
  lead: "mem-ana", pm: "mem-marco",
  assignees: ["mem-ana", "mem-ben", "mem-dmitri", "mem-nadia"],
  components: ["pipeline", "secrets", "runners", "ui", "infra"],
  epics: ["Pipeline orchestration", "Secrets management", "Rollback & recovery", "Deploy observability"],
  statuses: STATUSES,
  sprintFor: (status, i) => {
    if (status === "done") return rot(["spr-dep-2", "spr-dep-3", null], i);
    if (status === "in_progress" || status === "in_review" || status === "todo") return "spr-dep-3";
    return rot([null, null], i);
  },
  versionFor: (status, i) => status === "done" ? rot(["ver-dep-040", "ver-dep-050"], i) : (status === "in_review" || status === "in_progress" ? "ver-dep-050" : null),
  labelsFor: (type, i) => type === "bug" ? rot(["reliability", "security", "data"], i) : rot(["backend", "infra", "security", ""], i),
  items: [
    { epic: 0, type: "story", title: "Parallel stage execution", status: "done", assignee: "mem-dmitri", estimate: 8, subtasks: ["Build the DAG scheduler", "Cap concurrency per runner"] },
    { epic: 0, type: "story", title: "Reusable pipeline templates", status: "in_progress", assignee: "mem-nadia", estimate: 5 },
    { epic: 0, type: "story", title: "Manual approval gate between stages", status: "todo", assignee: "mem-ben", estimate: 3 },
    { epic: 0, type: "bug", title: "Deploy queue stuck when a runner goes offline", status: "in_progress", priority: "highest", assignee: "mem-dmitri", estimate: 5 },
    { epic: 0, type: "task", title: "Retry transient runner failures automatically", status: "todo", assignee: "mem-dmitri", estimate: 3 },
    { epic: 1, type: "story", title: "Encrypt secrets at rest with KMS", status: "done", assignee: "mem-ben", estimate: 8, subtasks: ["Wrap secrets with a data key", "Rotate the KMS key quarterly"] },
    { epic: 1, type: "story", title: "Scoped secrets per environment", status: "in_review", assignee: "mem-ben", estimate: 5 },
    { epic: 1, type: "bug", title: "Secrets leak into build logs on failure", status: "in_progress", priority: "highest", assignee: "mem-ben", estimate: 3, labels: "security" },
    { epic: 1, type: "task", title: "Mask secret values in the live log stream", status: "todo", assignee: "mem-nadia", estimate: 2 },
    { epic: 2, type: "story", title: "One-click rollback to the previous release", status: "in_progress", assignee: "mem-ana", estimate: 8, priority: "high", subtasks: ["Snapshot the release manifest", "Confirm rollback with a diff"] },
    { epic: 2, type: "story", title: "Canary deploy strategy", status: "todo", assignee: "mem-dmitri", estimate: 8 },
    { epic: 2, type: "story", title: "Blue/green switch for the API", status: "backlog", assignee: "mem-ana", estimate: 8 },
    { epic: 2, type: "bug", title: "Rollback leaves orphaned database migrations", status: "todo", priority: "high", assignee: "mem-ben", estimate: 5 },
    { epic: 3, type: "story", title: "Audit log for every deploy", status: "done", assignee: "mem-nadia", estimate: 5 },
    { epic: 3, type: "story", title: "Slack notification on a failed deploy", status: "done", assignee: "mem-nadia", estimate: 2 },
    { epic: 3, type: "story", title: "Deploy frequency and lead-time dashboard", status: "in_review", assignee: "mem-nadia", estimate: 5 },
    { epic: 3, type: "bug", title: "Dashboard shows the wrong deploy duration", status: "todo", priority: "medium", assignee: "mem-nadia", estimate: 2 },
    { epic: 3, type: "bug", title: "Audit log misses manual rollbacks", status: "backlog", priority: "medium", assignee: "mem-nadia", estimate: 2 },
    { epic: 0, type: "task", title: "Upgrade runner base image to Ubuntu 24.04", status: "backlog", assignee: "mem-dmitri", estimate: 3 },
    { epic: 1, type: "story", title: "Import secrets from the old vault", status: "wont_do", assignee: "mem-ben", estimate: 5, priority: "low" },
    { epic: 0, type: "story", title: "Matrix builds across OS and runtime versions", status: "backlog", assignee: "mem-dmitri", estimate: 8 },
    { epic: 0, type: "task", title: "Cache dependencies between pipeline runs", status: "in_progress", assignee: "mem-nadia", estimate: 3 },
    { epic: 0, type: "bug", title: "Stage timeout not honoured for long builds", status: "todo", priority: "medium", assignee: "mem-dmitri", estimate: 2 },
    { epic: 1, type: "task", title: "Audit who accessed which secret", status: "backlog", assignee: "mem-ben", estimate: 3, labels: "security" },
    { epic: 2, type: "story", title: "Automatic rollback on health-check failure", status: "backlog", assignee: "mem-ana", estimate: 8, priority: "high" },
    { epic: 2, type: "task", title: "Dry-run mode for a deploy plan", status: "todo", assignee: "mem-ana", estimate: 3 },
    { epic: 3, type: "story", title: "Per-service deploy history timeline", status: "backlog", assignee: "mem-nadia", estimate: 5 },
    { epic: 3, type: "task", title: "Export deploy metrics to Prometheus", status: "backlog", assignee: "mem-dmitri", estimate: 3 },
    { epic: 0, type: "story", title: "Trigger pipelines from a Git tag", status: "done", assignee: "mem-nadia", estimate: 3 },
    { epic: 1, type: "bug", title: "Secret rotation skips disabled environments", status: "backlog", priority: "low", assignee: "mem-ben", estimate: 2 },
    { epic: 2, type: "bug", title: "Canary never promotes when metrics are flat", status: "todo", priority: "medium", assignee: "mem-dmitri", estimate: 3 },
  ],
});

// ---- WEB: Kestrel Website ----
buildProject("proj-web", {
  lead: "mem-lena", pm: "mem-marco",
  assignees: ["mem-lena", "mem-nadia", "mem-dmitri"],
  components: ["design", "web", "content", "seo"],
  epics: ["Marketing site redesign", "Careers section", "Engineering blog"],
  statuses: STATUSES,
  sprintFor: (status, i) => (status === "done" || status === "wont_do") ? null : "spr-web-1",
  versionFor: (status, i) => "ver-web-200",
  labelsFor: (type, i) => type === "bug" ? rot(["seo", "a11y"], i) : rot(["design", "frontend", "content", ""], i),
  items: [
    { epic: 0, type: "story", title: "New landing page hero and above-the-fold", status: "done", assignee: "mem-lena", estimate: 5 },
    { epic: 0, type: "story", title: "Case studies gallery", status: "in_review", assignee: "mem-nadia", estimate: 5 },
    { epic: 0, type: "story", title: "Dark mode toggle", status: "in_progress", assignee: "mem-nadia", estimate: 3 },
    { epic: 0, type: "task", title: "Cookie consent banner", status: "todo", assignee: "mem-dmitri", estimate: 2 },
    { epic: 0, type: "bug", title: "Lighthouse score below 80 on mobile", status: "todo", priority: "high", assignee: "mem-nadia", estimate: 3 },
    { epic: 0, type: "bug", title: "Broken links in the footer", status: "in_progress", priority: "low", assignee: "mem-dmitri", estimate: 1 },
    { epic: 1, type: "story", title: "Careers listing from the Greenhouse API", status: "todo", assignee: "mem-dmitri", estimate: 5 },
    { epic: 1, type: "story", title: "Job detail page and apply flow", status: "backlog", assignee: "mem-nadia", estimate: 5 },
    { epic: 1, type: "task", title: "Contact form spam protection", status: "backlog", assignee: "mem-dmitri", estimate: 2 },
    { epic: 2, type: "story", title: "Blog platform with MDX support", status: "in_progress", assignee: "mem-nadia", estimate: 8 },
    { epic: 2, type: "story", title: "Author pages and RSS feed", status: "backlog", assignee: "mem-nadia", estimate: 3 },
    { epic: 2, type: "task", title: "Migrate three old posts to MDX", status: "backlog", assignee: "mem-lena", estimate: 2 },
    { epic: 0, type: "bug", title: "Hero video autoplay blocked on Safari", status: "wont_do", priority: "low", assignee: "mem-nadia", estimate: 1 },
    { epic: 0, type: "story", title: "Pricing page with plan comparison", status: "todo", assignee: "mem-lena", estimate: 5 },
    { epic: 0, type: "task", title: "Open Graph images for every page", status: "backlog", assignee: "mem-nadia", estimate: 2 },
    { epic: 1, type: "story", title: "Team page pulled from the HR system", status: "backlog", assignee: "mem-dmitri", estimate: 3 },
    { epic: 1, type: "bug", title: "Apply form drops the attached CV over 5 MB", status: "todo", priority: "medium", assignee: "mem-dmitri", estimate: 2 },
    { epic: 2, type: "story", title: "Code syntax highlighting in blog posts", status: "todo", assignee: "mem-nadia", estimate: 2 },
    { epic: 2, type: "task", title: "Newsletter signup on the blog", status: "backlog", assignee: "mem-nadia", estimate: 2 },
    { epic: 0, type: "task", title: "Set up analytics with cookie-less tracking", status: "in_review", assignee: "mem-dmitri", estimate: 3 },
    { epic: 0, type: "bug", title: "Layout shift on the testimonials carousel", status: "backlog", priority: "low", assignee: "mem-nadia", estimate: 1 },
  ],
});

// ---- PAY: Harbor Payments (archived, shipped) ----
buildProject("proj-pay", {
  lead: "mem-ben", pm: "mem-marco",
  assignees: ["mem-ben", "mem-dmitri", "mem-ana"],
  components: ["ledger", "payouts", "compliance", "api"],
  epics: ["Core ledger", "Payouts", "Compliance & audit"],
  epicStatus: () => "done",
  statuses: ["done", "done", "done", "done", "wont_do"],
  subtaskStatus: (parentStatus) => parentStatus === "wont_do" ? "wont_do" : "done",
  sprintFor: () => "spr-pay-ga",
  versionFor: () => "ver-pay-100",
  labelsFor: (type, i) => type === "bug" ? "fixed" : rot(["backend", "api", "compliance"], i),
  items: [
    { epic: 0, type: "story", title: "Double-entry ledger service", status: "done", assignee: "mem-ben", estimate: 13, subtasks: ["Define the account chart", "Enforce balanced transactions"] },
    { epic: 0, type: "story", title: "Idempotency keys on charges", status: "done", assignee: "mem-dmitri", estimate: 5 },
    { epic: 0, type: "story", title: "Reconciliation report", status: "done", assignee: "mem-ben", estimate: 5 },
    { epic: 0, type: "bug", title: "Ledger balance off by a cent on rounding", status: "done", priority: "highest", assignee: "mem-ben", estimate: 3 },
    { epic: 1, type: "story", title: "ACH payout scheduling", status: "done", assignee: "mem-dmitri", estimate: 8 },
    { epic: 1, type: "story", title: "Webhook delivery with retries", status: "done", assignee: "mem-dmitri", estimate: 5 },
    { epic: 1, type: "story", title: "Payout failure notifications", status: "done", assignee: "mem-ana", estimate: 3 },
    { epic: 1, type: "bug", title: "Duplicate payout on retry storm", status: "done", priority: "highest", assignee: "mem-dmitri", estimate: 5 },
    { epic: 2, type: "story", title: "KYC verification flow", status: "done", assignee: "mem-ana", estimate: 8 },
    { epic: 2, type: "story", title: "PCI DSS audit remediation", status: "done", assignee: "mem-ben", estimate: 8 },
    { epic: 2, type: "task", title: "Encrypt PII columns at rest", status: "done", assignee: "mem-dmitri", estimate: 5 },
    { epic: 2, type: "story", title: "Self-serve data export for compliance", status: "wont_do", assignee: "mem-ana", estimate: 5, priority: "low" },
  ],
});

db.issue.insertMany(issues);

// ---------------------------------------------------------------- comments
const commentBodies = [
  "Picking this up now — should have a PR by end of day.",
  "Blocked on the API contract; pinged the backend channel.",
  "Reproduced on my device. Attaching a screen recording.",
  "Design review done, looks good to ship once the copy lands.",
  "Can we split this into a sub-task for the Android side?",
  "Rebased on main, the flaky test is gone now.",
  "Client asked for this before the demo on Friday.",
  "Added a regression test so we don't hit this again.",
  "Moving to In Review — needs a second pair of eyes.",
  "Deferring to next sprint, out of capacity this week.",
];
const comments = [];
let cseq = 0;
issues.forEach((it, i) => {
  // About 60% of issues get 1-2 comments.
  if (i % 5 === 0) return;
  const n = (i % 3 === 0) ? 2 : 1;
  for (let k = 0; k < n; k++) {
    cseq += 1;
    const author = it.assignee || it.reporter;
    const other = it.reporter;
    comments.push({
      _id: `cmt-${String(cseq).padStart(4, "0")}`,
      issue: it._id, issue_key: it.key,
      author: k === 0 ? author : other, author_name: memberName[k === 0 ? author : other],
      body: rot(commentBodies, i + k),
      created_at: new Date(it.created_at.getTime() + (k + 1) * 36e5),
    });
  }
});
db.comment.insertMany(comments);

// ---------------------------------------------------------------- worklogs
const worklogNotes = ["Pairing session", "Investigation", "Implementation", "Code review fixes", "Testing on device", "Bug triage"];
const worklogs = [];
let wseq = 0;
issues.forEach((it, i) => {
  if (it.status === "backlog" || it.status === "wont_do") return; // only started work logs time
  if (i % 3 !== 0) return;
  const n = (i % 6 === 0) ? 2 : 1;
  for (let k = 0; k < n; k++) {
    wseq += 1;
    const who = it.assignee || it.reporter;
    worklogs.push({
      _id: `wl-${String(wseq).padStart(4, "0")}`,
      issue: it._id, issue_key: it.key,
      author: who, author_name: memberName[who],
      // minutes stored as an int (Vantage has no duration type).
      minutes: rot([30, 60, 90, 120, 45, 180], i + k),
      note: rot(worklogNotes, i + k),
      spent_on: new Date(it.created_at.getTime() + (k + 1) * 24 * 36e5),
    });
  }
});
db.worklog.insertMany(worklogs);

// ---------------------------------------------------------------- watchers
const watchers = [];
let waseq = 0;
issues.forEach((it, i) => {
  const set = new Set([it.reporter]);
  if (it.assignee) set.add(it.assignee);
  // Marco (PM) watches high/highest priority work; leads watch their epics.
  if (it.priority === "highest" || it.priority === "high") set.add("mem-marco");
  for (const m of set) {
    waseq += 1;
    watchers.push({ _id: `wat-${String(waseq).padStart(5, "0")}`, issue: it._id, issue_key: it.key, member: m, member_name: memberName[m] });
  }
});
db.watcher.insertMany(watchers);

// ---------------------------------------------------------------- issue links
function keyToId(k) { const it = issues.find(x => x.key === k); return it ? it._id : null; }
function link(srcKey, type, dstKey) {
  const s = keyToId(srcKey), d = keyToId(dstKey);
  if (!s || !d) return;
  return { source: s, source_key: srcKey, type, target: d, target_key: dstKey };
}
const rawLinks = [
  link("BOOK-11", "blocks", "BOOK-10"),           // save cards blocks apply promo? -> shape as blocks
  link("BOOK-15", "is_blocked_by", "BOOK-11"),
  link("BOOK-6", "relates_to", "BOOK-4"),
  link("BOOK-7", "relates_to", "BOOK-1"),
  link("BOOK-14", "duplicates", "BOOK-10"),
  link("DEPLOY-8", "blocks", "DEPLOY-9"),
  link("DEPLOY-13", "is_blocked_by", "DEPLOY-10"),
  link("DEPLOY-4", "relates_to", "DEPLOY-1"),
  link("DEPLOY-17", "relates_to", "DEPLOY-16"),
  link("WEB-5", "relates_to", "WEB-1"),
  link("WEB-6", "blocks", "WEB-2"),
  link("PAY-8", "relates_to", "PAY-5"),
  link("PAY-4", "relates_to", "PAY-1"),
].filter(Boolean);
const issue_links = rawLinks.map((l, i) => Object.assign({ _id: `lnk-${String(i + 1).padStart(3, "0")}` }, l));
if (issue_links.length) db.issue_link.insertMany(issue_links);

// ---------------------------------------------------------------- indexes
db.issue.createIndex({ project: 1, status: 1 });
db.issue.createIndex({ sprint: 1 });
db.issue.createIndex({ assignee: 1 });
db.issue.createIndex({ parent: 1 });
db.comment.createIndex({ issue: 1 });
db.worklog.createIndex({ issue: 1 });
db.watcher.createIndex({ issue: 1 });

print("seeded:",
  db.member.countDocuments(), "members,",
  db.project.countDocuments(), "projects,",
  db.sprint.countDocuments(), "sprints,",
  db.getCollection("version").countDocuments(), "versions,",
  db.issue.countDocuments(), "issues,",
  db.comment.countDocuments(), "comments,",
  db.worklog.countDocuments(), "worklogs,",
  db.watcher.countDocuments(), "watchers,",
  db.issue_link.countDocuments(), "links");

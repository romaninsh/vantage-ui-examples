// tests/views.js — read-only MongoDB views that feed Jiro's dashboard and release notes.
// Re-runnable. Views are poll-path tables in Vantage (give their tiles refresh_interval).
// Every view's _id comes out as a string.

for (const v of ["issue_done", "status_counts", "type_counts", "priority_counts",
                 "workload", "sprint_progress", "epic_progress", "issue_kpis"]) {
  db.getCollection(v).drop();
}

// Done issues, for release notes (single .where on this view avoids the live multi-filter bug).
db.createView("issue_done", "issue", [
  { $match: { status: "done" } }
]);

// Open issues by status, in workflow order.
const STATUS_LABEL = { $switch: { branches: [
  { case: { $eq: ["$_id", "backlog"] }, then: "Backlog" },
  { case: { $eq: ["$_id", "todo"] }, then: "To Do" },
  { case: { $eq: ["$_id", "in_progress"] }, then: "In Progress" },
  { case: { $eq: ["$_id", "in_review"] }, then: "In Review" },
  { case: { $eq: ["$_id", "done"] }, then: "Done" },
  { case: { $eq: ["$_id", "wont_do"] }, then: "Won't Do" },
], default: "$_id" } };
const STATUS_ORD = { $switch: { branches: [
  { case: { $eq: ["$_id", "backlog"] }, then: 1 },
  { case: { $eq: ["$_id", "todo"] }, then: 2 },
  { case: { $eq: ["$_id", "in_progress"] }, then: 3 },
  { case: { $eq: ["$_id", "in_review"] }, then: 4 },
  { case: { $eq: ["$_id", "done"] }, then: 5 },
  { case: { $eq: ["$_id", "wont_do"] }, then: 6 },
], default: 9 } };
db.createView("status_counts", "issue", [
  { $group: { _id: "$status", issues: { $sum: 1 } } },
  { $set: { status: "$_id", label: STATUS_LABEL, ord: STATUS_ORD } },
  { $sort: { ord: 1 } },
]);

db.createView("type_counts", "issue", [
  { $group: { _id: "$type", issues: { $sum: 1 } } },
  { $set: { type: "$_id" } },
  { $sort: { issues: -1 } },
]);

const PRIO_ORD = { $switch: { branches: [
  { case: { $eq: ["$_id", "highest"] }, then: 1 },
  { case: { $eq: ["$_id", "high"] }, then: 2 },
  { case: { $eq: ["$_id", "medium"] }, then: 3 },
  { case: { $eq: ["$_id", "low"] }, then: 4 },
  { case: { $eq: ["$_id", "lowest"] }, then: 5 },
], default: 9 } };
db.createView("priority_counts", "issue", [
  { $match: { status: { $nin: ["done", "wont_do"] } } },
  { $group: { _id: "$priority", issues: { $sum: 1 } } },
  { $set: { priority: "$_id", ord: PRIO_ORD } },
  { $sort: { ord: 1 } },
]);

// Open workload per assignee.
db.createView("workload", "issue", [
  { $match: { status: { $nin: ["done", "wont_do"] }, assignee: { $ne: null } } },
  { $group: { _id: "$assignee", member_name: { $first: "$assignee_name" },
              open_issues: { $sum: 1 }, open_points: { $sum: { $ifNull: ["$estimate", 0] } } } },
  { $sort: { open_points: -1 } },
]);

// Per-sprint progress (points done vs total), with the sprint's state and dates.
db.createView("sprint_progress", "issue", [
  { $match: { sprint: { $ne: null } } },
  { $group: { _id: "$sprint",
      sprint_name: { $first: "$sprint_name" }, project_key: { $first: "$project_key" },
      total_issues: { $sum: 1 },
      done_issues: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
      total_points: { $sum: { $ifNull: ["$estimate", 0] } },
      done_points: { $sum: { $cond: [{ $eq: ["$status", "done"] }, { $ifNull: ["$estimate", 0] }, 0] } } } },
  { $lookup: { from: "sprint", localField: "_id", foreignField: "_id", as: "s" } },
  { $set: {
      state: { $first: "$s.state" }, start_date: { $first: "$s.start_date" }, end_date: { $first: "$s.end_date" },
      pct: { $cond: [{ $gt: ["$total_points", 0] },
                     { $round: [{ $multiply: [{ $divide: ["$done_points", "$total_points"] }, 100] }, 0] }, 0] } } },
  { $project: { s: 0 } },
  { $sort: { start_date: -1 } },
]);

// Per-epic child progress.
db.createView("epic_progress", "issue", [
  { $match: { parent: { $ne: null } } },
  { $group: { _id: "$parent", parent_key: { $first: "$parent_key" },
              total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } } } },
  { $lookup: { from: "issue", localField: "_id", foreignField: "_id", as: "p" } },
  { $set: { epic_title: { $first: "$p.title" }, parent_type: { $first: "$p.type" },
            project_key: { $first: "$p.project_key" },
            pct: { $cond: [{ $gt: ["$total", 0] },
                           { $round: [{ $multiply: [{ $divide: ["$done", "$total"] }, 100] }, 0] }, 0] } } },
  { $match: { parent_type: "epic" } },
  { $project: { p: 0 } },
  { $sort: { project_key: 1, pct: -1 } },
]);

// Headline KPI numbers, one row.
db.createView("issue_kpis", "issue", [
  { $group: { _id: null,
      total: { $sum: 1 },
      backlog: { $sum: { $cond: [{ $eq: ["$status", "backlog"] }, 1, 0] } },
      todo: { $sum: { $cond: [{ $eq: ["$status", "todo"] }, 1, 0] } },
      in_progress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
      in_review: { $sum: { $cond: [{ $eq: ["$status", "in_review"] }, 1, 0] } },
      done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
      wont_do: { $sum: { $cond: [{ $eq: ["$status", "wont_do"] }, 1, 0] } },
      bugs_open: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "bug"] },
                   { $not: [{ $in: ["$status", ["done", "wont_do"]] }] }] }, 1, 0] } },
      points_open: { $sum: { $cond: [{ $in: ["$status", ["backlog", "todo", "in_progress", "in_review"]] },
                   { $ifNull: ["$estimate", 0] }, 0] } },
      points_done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, { $ifNull: ["$estimate", 0] }, 0] } } } },
  { $set: { _id: "kpis", open: { $add: ["$backlog", "$todo", "$in_progress", "$in_review"] } } },
]);

print("views:", db.getCollectionInfos({ type: "view" }).map(v => v.name).sort().join(", "));
printjson(db.issue_kpis.findOne());
printjson(db.status_counts.find().toArray());

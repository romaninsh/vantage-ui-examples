#!/usr/bin/env bash
# Jiro invariants, checked against the live MongoDB (single-node replica set rs0).
# Re-run after seeding: tests/jiro_test.sh
set -uo pipefail

CONTAINER="${1:-$(docker ps --format '{{.Names}}' | grep -m1 'vantage-server-jiro.*-mongo-')}"
[ -n "$CONTAINER" ] || { echo "no jiro mongo container running"; exit 1; }
DB="${DB:-jiro}"
Q() { docker exec "$CONTAINER" mongosh "$DB" --quiet --eval "$1"; }

fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   - $1"; else echo "FAIL - $1 (expected $2, got $3)"; fail=1; fi; }

# ---- seed counts ----
check "9 members"   "9"  "$(Q 'db.member.countDocuments()')"
check "4 projects"  "4"  "$(Q 'db.project.countDocuments()')"
check "7 sprints"   "7"  "$(Q 'db.sprint.countDocuments()')"
check "7 versions"  "7"  "$(Q 'db.getCollection("version").countDocuments()')"
check "132 issues"  "132" "$(Q 'db.issue.countDocuments()')"

# ---- every _id is a string (a non-string _id breaks the whole Mongo table) ----
check "issue ids all strings" "0" "$(Q 'db.issue.countDocuments({ _id: { $not: { $type: "string" } } })')"

# ---- referential integrity: issue -> project / assignee / reporter ----
check "no issue with a missing project" "0" "$(Q '
  db.issue.aggregate([
    { $lookup: { from: "project", localField: "project", foreignField: "_id", as: "p" } },
    { $match: { p: { $size: 0 } } }, { $count: "n" }
  ]).toArray()[0]?.n ?? 0')"
check "no issue with a dangling assignee" "0" "$(Q '
  db.issue.aggregate([
    { $match: { assignee: { $ne: null } } },
    { $lookup: { from: "member", localField: "assignee", foreignField: "_id", as: "m" } },
    { $match: { m: { $size: 0 } } }, { $count: "n" }
  ]).toArray()[0]?.n ?? 0')"
check "no issue with a dangling reporter" "0" "$(Q '
  db.issue.aggregate([
    { $lookup: { from: "member", localField: "reporter", foreignField: "_id", as: "m" } },
    { $match: { m: { $size: 0 } } }, { $count: "n" }
  ]).toArray()[0]?.n ?? 0')"

# ---- self-relation integrity: every parent points at a real issue ----
check "no issue with a dangling parent" "0" "$(Q '
  db.issue.aggregate([
    { $match: { parent: { $ne: null } } },
    { $lookup: { from: "issue", localField: "parent", foreignField: "_id", as: "p" } },
    { $match: { p: { $size: 0 } } }, { $count: "n" }
  ]).toArray()[0]?.n ?? 0')"

# ---- denormalised display columns stay consistent with the source ----
check "assignee_name matches member.name" "0" "$(Q '
  db.issue.aggregate([
    { $match: { assignee: { $ne: null } } },
    { $lookup: { from: "member", localField: "assignee", foreignField: "_id", as: "m" } },
    { $match: { $expr: { $ne: ["$assignee_name", { $first: "$m.name" }] } } }, { $count: "n" }
  ]).toArray()[0]?.n ?? 0')"
check "project_key matches project.key" "0" "$(Q '
  db.issue.aggregate([
    { $lookup: { from: "project", localField: "project", foreignField: "_id", as: "p" } },
    { $match: { $expr: { $ne: ["$project_key", { $first: "$p.key" }] } } }, { $count: "n" }
  ]).toArray()[0]?.n ?? 0')"

# ---- enum domains ----
check "status in workflow set" "0" "$(Q '
  db.issue.countDocuments({ status: { $nin: ["backlog","todo","in_progress","in_review","done","wont_do"] } })')"
check "type in type set" "0" "$(Q '
  db.issue.countDocuments({ type: { $nin: ["epic","story","task","bug","sub-task"] } })')"
check "priority in priority set" "0" "$(Q '
  db.issue.countDocuments({ priority: { $nin: ["highest","high","medium","low","lowest"] } })')"

# ---- the status_counts view totals the issue collection ----
check "status_counts sums to 132" "132" "$(Q '
  db.status_counts.aggregate([{ $group: { _id: null, n: { $sum: "$issues" } } }]).toArray()[0]?.n ?? 0')"

# ---- archived PAY project has no open work (engagement wrapped) ----
check "no open issues in archived PAY" "0" "$(Q '
  db.issue.countDocuments({ project: "proj-pay", status: { $in: ["todo","in_progress","in_review"] } })')"

# ---- lifecycle with a scratch issue: insert -> move -> delete; count intact ----
Q 'db.issue.insertOne({ _id: "iss-scratch", key: "BOOK-999", project: "proj-book", project_key: "BOOK",
    type: "task", title: "scratch", status: "backlog", priority: "low", reporter: "mem-marco",
    reporter_name: "Marco Rossi", rank: 999999, created_at: new Date(), updated_at: new Date() })' > /dev/null
Q 'db.issue.updateOne({ _id: "iss-scratch" }, { $set: { status: "done" } })' > /dev/null
check "scratch issue moved to done" "done" "$(Q 'db.issue.findOne({ _id: "iss-scratch" }).status')"
Q 'db.issue.deleteOne({ _id: "iss-scratch" })' > /dev/null
check "issue count intact after scratch" "132" "$(Q 'db.issue.countDocuments()')"

if [ "$fail" = 0 ]; then echo "PASS: Jiro invariants hold"; else echo "FAIL"; exit 1; fi

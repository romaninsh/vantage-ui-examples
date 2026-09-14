#!/usr/bin/env python3
"""Normalize bronze into silver + gold tables. Idempotent; safe to re-run.

Sources (newest raw_payload per identifier):
  cargo_toml (app)   -> release_ (app crate), dependency_pin
  tag                -> release_ cut dates, release-PR detection (sha match)
  release            -> release_ (draft flag, published_at, notes, url)
  crate_version      -> release_ (dependency crates, crates.io timestamps)
  pull_request       -> pull_request (+ release_id for app PRs via merge
                        windows; release_pr links for dep-repo PRs per crate)

Derived:
  bumps_version on PRs   PR merge commit == tag commit (the release PR)
  dependency_bump        pin diff between consecutive app releases
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
import lib

INF = "9999-12-31T23:59:59"


def latest(con, kind: str, repo: str) -> dict[str, dict]:
    rows = con.execute(
        "SELECT identifier, payload FROM raw_payload r WHERE kind=? AND repo=?"
        " AND fetched_at = (SELECT MAX(fetched_at) FROM raw_payload"
        "                    WHERE kind=? AND repo=? AND identifier=r.identifier)",
        (kind, repo, kind, repo),
    ).fetchall()
    return {r["identifier"]: json.loads(r["payload"]) for r in rows}


def upsert_repo(con, repo: dict) -> int:
    con.execute(
        "INSERT INTO repo (owner, name, kind, url) VALUES (?, ?, ?, ?)"
        " ON CONFLICT(owner, name) DO UPDATE SET kind=excluded.kind, url=excluded.url",
        (repo["owner"], repo["name"], repo["kind"], config.repo_full(repo)),
    )
    return con.execute("SELECT id FROM repo WHERE owner=? AND name=?",
                       (repo["owner"], repo["name"])).fetchone()[0]


def upsert_package(con, repo_id: int, name: str, kind: str) -> int:
    con.execute(
        "INSERT INTO package (repo_id, name, kind) VALUES (?, ?, ?)"
        " ON CONFLICT(name) DO UPDATE SET kind=excluded.kind",
        (repo_id, name, kind),
    )
    return con.execute("SELECT id FROM package WHERE name=?", (name,)).fetchone()[0]


def insert_release(con, pkg_id: int, version: str, status: str, tag=None,
                   published_at=None, notes=None, url=None) -> int:
    con.execute(
        "INSERT INTO release_ (package_id, version, status, tag, published_at, notes, url)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)"
        " ON CONFLICT(package_id, version) DO UPDATE SET status=excluded.status,"
        " tag=excluded.tag, published_at=excluded.published_at,"
        " notes=COALESCE(excluded.notes, notes), url=COALESCE(excluded.url, url)",
        (pkg_id, version, status, tag, published_at, notes, url),
    )
    return con.execute("SELECT id FROM release_ WHERE package_id=? AND version=?",
                       (pkg_id, version)).fetchone()[0]


# ------------------------------------------------------------------- app -----

def app_releases(con, app_repo: dict, app_pkg_id: int) -> list[tuple]:
    """[(release_id, version, cut, status)] for merge-window assignment."""
    full = config.repo_full(app_repo)
    cargos = latest(con, "cargo_toml", full)
    tags = latest(con, "tag", full)
    gh_rels = latest(con, "release", full)

    app_cargo, pins_by_ref = {}, {}
    for ident, p in cargos.items():
        ref, _, label = ident.rpartition(":")
        if label == "app":
            app_cargo[ref] = p
        else:
            pins_by_ref[ref] = p

    cands: dict[str, dict] = {}
    for ref, p in app_cargo.items():
        if ref == "HEAD":
            continue
        cands[p["version"]] = {"version": p["version"], "tag": ref, "status": "published"}
    head = app_cargo.get("HEAD")
    if head and head.get("version") and head["version"] not in cands:
        cands[head["version"]] = {"version": head["version"], "tag": None,
                                  "status": "unreleased"}

    for tag_name, ghr in gh_rels.items():
        v = (ghr.get("tag_name") or ghr.get("name") or "").lstrip("v")
        if not re.match(r"^\d+(\.\d+)*$", v or ""):
            continue  # non-semver tags ("plugins", ...) are not releases
        row = cands.setdefault(v, {"version": v, "tag": None, "status": "draft"})
        if row["status"] == "unreleased" and ghr.get("draft"):
            row["status"] = "draft"
        if ghr.get("published_at"):
            row["status"] = "published"
            row["tag"] = row.get("tag") or ghr.get("tag_name")
        row["published_at"] = ghr.get("published_at")
        row["notes"] = ghr.get("body")
        row["url"] = ghr.get("html_url")

    # cut dates: published_at, else the tag's creator date, else next release
    ordered = sorted(cands.values(), key=lambda r: lib.version_key(r["version"]))
    cuts: dict[str, str] = {}
    nxt = INF
    for row in reversed(ordered):
        if row["status"] == "published":
            tag_date = tags.get(row.get("tag") or "", {}).get("date")
            cuts[row["version"]] = row.get("published_at") or tag_date or nxt
        else:
            cuts[row["version"]] = INF
        nxt = cuts[row["version"]]

    result = []
    for row in ordered:
        rid = insert_release(con, app_pkg_id, row["version"], row["status"],
                             row.get("tag"), row.get("published_at"),
                             row.get("notes"), row.get("url"))
        result.append((rid, row["version"], cuts[row["version"]], row["status"]))
    _app_pins(con, app_pkg_id, pins_by_ref)
    return result


def _app_pins(con, app_pkg_id: int, pins_by_ref: dict) -> None:
    pkg_ids = {p["name"]: p["id"] for p in con.execute("SELECT id, name FROM package")}
    releases = con.execute(
        "SELECT id, version, tag, status FROM release_ WHERE package_id=?",
        (app_pkg_id,)).fetchall()
    by_tag = {r["tag"]: r for r in releases if r["tag"]}
    head_row = next((r for r in releases if r["status"] != "published"), None)

    for ref, p in pins_by_ref.items():
        row = by_tag.get(ref) or (head_row if ref == "HEAD" else None)
        if row is None:
            continue
        for crate, ver in (p.get("deps") or {}).items():
            dep_id = pkg_ids.get(crate)
            if dep_id is None:
                continue  # crate not configured — extend config.py
            con.execute(
                "INSERT INTO dependency_pin (release_id, dep_package_id, pinned_version, source_ref)"
                " VALUES (?, ?, ?, ?)"
                " ON CONFLICT(release_id, dep_package_id) DO UPDATE SET"
                " pinned_version=excluded.pinned_version, source_ref=excluded.source_ref",
                (row["id"], dep_id, ver, ref))


# ------------------------------------------------------------------- deps ----

def dep_releases(con, deps_repo: dict) -> dict[str, list[tuple]]:
    """{(pkg_name): [(release_id, version, cut, status)]} sorted by cut."""
    full = config.repo_full(deps_repo)
    repo_id = con.execute("SELECT id FROM repo WHERE owner=? AND name=?",
                          (deps_repo["owner"], deps_repo["name"])).fetchone()[0]
    out: dict[str, list[tuple]] = {}
    for crate in config.DEPENDENCY_CRATES:
        pkg_id = upsert_package(con, repo_id, crate, "dependency")
        rows = []
        for num, v in latest(con, "crate_version", crate).items():
            rid = insert_release(con, pkg_id, num, "published",
                                 published_at=v.get("created_at"),
                                 url=f"https://crates.io/crates/{crate}/{num}")
            rows.append((rid, num, v.get("created_at") or INF, "published"))
        rows.sort(key=lambda r: r[2])
        out[crate] = rows
    return out


# -------------------------------------------------------------------- prs ----

def transform_prs(con, repo: dict, repo_id: int, cuts: list[tuple]) -> None:
    """cuts = merge windows for this repo's 'primary' series (app releases)."""
    full = config.repo_full(repo)
    prs = latest(con, "pull_request", full)
    tags = latest(con, "tag", full)
    tag_shas = {t.get("sha"): name for name, t in tags.items()}

    for num, pr in prs.items():
        state = "merged" if pr.get("merged_at") else (pr.get("state") or "closed")
        labels = json.dumps([l["name"] for l in pr.get("labels", [])])
        bumps = 1 if (pr.get("merge_commit_sha") or "") in tag_shas else 0
        con.execute(
            "INSERT INTO pull_request (repo_id, number, title, body, author, state,"
            " labels, created_at, merged_at, url, bumps_version)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            " ON CONFLICT(repo_id, number) DO UPDATE SET title=excluded.title,"
            " body=excluded.body, author=excluded.author, state=excluded.state,"
            " labels=excluded.labels, merged_at=excluded.merged_at, url=excluded.url,"
            " bumps_version=excluded.bumps_version",
            (repo_id, pr["number"], pr["title"] or "", pr.get("body") or "",
             (pr.get("user") or {}).get("login"), state, labels,
             pr.get("created_at"), pr.get("merged_at"), pr.get("html_url"), bumps),
        )

    windows = sorted((c for c in cuts if c[3] == "published"), key=lambda c: c[2])
    windows += sorted((c for c in cuts if c[3] != "published"),
                      key=lambda c: lib.version_key(c[1]))

    for num, pr in prs.items():
        if not pr.get("merged_at"):
            continue
        db_id = con.execute("SELECT id FROM pull_request WHERE repo_id=? AND number=?",
                            (repo_id, pr["number"])).fetchone()[0]
        target = None
        for rid, v, cut, status in windows:
            if cut != INF and pr["merged_at"] <= cut:
                target = rid
                break
        if target is None:
            trailing = [c for c in windows if c[2] == INF]
            target = trailing[-1][0] if trailing else None
        if repo["kind"] == "app":
            con.execute("UPDATE pull_request SET release_id=? WHERE id=?", (target, db_id))


def link_dep_prs(con, deps_repo: dict, dep_cuts: dict[str, list[tuple]]) -> None:
    """Many-to-many: a dep-repo PR ships in every crate release whose window
    contains its merge (one link per crate — the first cut after the merge)."""
    repo_id = con.execute("SELECT id FROM repo WHERE owner=? AND name=?",
                          (deps_repo["owner"], deps_repo["name"])).fetchone()[0]
    # Attribution needs diff parsing (which crates a PR actually bumped);
    # window-nearest links are wrong 95% of the time, so keep the table empty
    # until that exists. See README "Known limitations".
    con.execute("DELETE FROM release_pr")
    return
    for pr in con.execute(
            "SELECT id, merged_at FROM pull_request WHERE repo_id=? AND merged_at IS NOT NULL",
            (repo_id,)).fetchall():
        for crate, rows in dep_cuts.items():
            for rid, v, cut, status in rows:
                if cut != INF and pr["merged_at"] <= cut:
                    con.execute("INSERT OR IGNORE INTO release_pr (pr_id, release_id)"
                                " VALUES (?, ?)", (pr["id"], rid))
                    break


# ------------------------------------------------------------------ bumps ----

def transform_bumps(con, app_pkg_id: int) -> None:
    con.execute("DELETE FROM dependency_bump")  # derived; recompute fully
    releases = sorted(
        con.execute("SELECT id, version FROM release_ WHERE package_id=?",
                    (app_pkg_id,)).fetchall(),
        key=lambda r: lib.version_key(r["version"]))
    prev = None
    for rel in releases:
        pins = {p["dep_package_id"]: p["pinned_version"] for p in con.execute(
            "SELECT dep_package_id, pinned_version FROM dependency_pin WHERE release_id=?",
            (rel["id"],))}
        if not pins:
            continue  # draft/unreleased rows without pins carry no pin state
        if prev is not None:
            prev_pins = {p["dep_package_id"]: p["pinned_version"] for p in con.execute(
                "SELECT dep_package_id, pinned_version FROM dependency_pin WHERE release_id=?",
                (prev["id"],))}
            for dep_id, to_v in pins.items():
                from_v = prev_pins.get(dep_id)
                if from_v != to_v:
                    con.execute(
                        "INSERT INTO dependency_bump (release_id, dep_package_id, from_version, to_version)"
                        " VALUES (?, ?, ?, ?) ON CONFLICT(release_id, dep_package_id) DO UPDATE SET"
                        " from_version=excluded.from_version, to_version=excluded.to_version",
                        (rel["id"], dep_id, from_v, to_v))
        prev = rel


def main() -> int:
    with lib.Run("transform") as con:
        app_repo_id = upsert_repo(con, config.APP_REPO)
        app_pkg_id = upsert_package(con, app_repo_id, config.APP_CRATE, "app")
        upsert_repo(con, config.DEPS_REPO)

        cuts = app_releases(con, config.APP_REPO, app_pkg_id)
        transform_prs(con, config.APP_REPO, app_repo_id, cuts)
        dep_cuts = dep_releases(con, config.DEPS_REPO)
        dep_repo_id = con.execute("SELECT id FROM repo WHERE owner=? AND name=?",
                                  (config.DEPS_REPO["owner"],
                                   config.DEPS_REPO["name"])).fetchone()[0]
        transform_prs(con, config.DEPS_REPO, dep_repo_id, [])
        link_dep_prs(con, config.DEPS_REPO, dep_cuts)
        transform_bumps(con, app_pkg_id)
        con.commit()
        for t in ("repo", "package", "release_", "pull_request", "release_pr",
                  "dependency_pin", "dependency_bump"):
            print(f"{t}: {con.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

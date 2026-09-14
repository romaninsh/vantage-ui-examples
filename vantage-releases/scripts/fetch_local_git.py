#!/usr/bin/env python3
"""Collect git tags + Cargo.toml snapshots from bare mirrors (bronze layer).

Clones (first run) or fetches a bare mirror of each source repo into
data/git/<name>.git, then reads, for the app repo:
  - tags with commit sha + creator date                    -> kind=tag
  - APP_CARGO_PATH and PINS_CARGO_PATH at every tag        -> kind=cargo_toml
  - both at the default branch HEAD (unreleased state)     -> kind=cargo_toml

Git over HTTPS needs no API token and no rate limits, which keeps the GitHub
API budget for PRs and releases.
"""

import json
import subprocess
import sys
import tomllib
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
import lib

TAG_FORMAT = "%(refname:short)%09%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end)%09%(creatordate:iso-strict)"


def git(mirror: Path, *args: str) -> str:
    r = subprocess.run(["git", "-C", str(mirror), *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {r.stderr.strip()}")
    return r.stdout


def fresh_clone(repo: dict) -> Path:
    """Clone a fresh bare mirror into per-run scratch (disposable; bronze in
    sqlite is the durable copy). Avoids re-writing into provenance-locked
    directories created by earlier git runs."""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    mirror = lib.scratch_dir() / f"{repo['name']}-{stamp}.git"
    mirror.parent.mkdir(parents=True, exist_ok=True)
    url = f"https://github.com/{config.repo_full(repo)}.git"
    print(f"cloning {url} -> {mirror} ...")
    git(mirror.parent, "clone", "--bare", "--quiet", url, str(mirror))
    return mirror


def to_utc_z(iso: str) -> str:
    dt = datetime.fromisoformat(iso)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_cargo(text: str) -> dict:
    doc = tomllib.loads(text)
    deps = {}
    dep_sections = [doc.get("dependencies") or {},
                    (doc.get("workspace") or {}).get("dependencies") or {}]
    for section in dep_sections:
        for name, spec in section.items():
            if name in config.DEPENDENCY_CRATES:
                deps[name] = spec.get("version", "?") if isinstance(spec, dict) else str(spec)
    return {"version": (doc.get("package") or {}).get("version"), "deps": deps}


def collect_app_repo(con, run_id: int, repo: dict) -> None:
    full = config.repo_full(repo)
    mirror = fresh_clone(repo)

    tags = []
    for line in git(mirror, "for-each-ref", "--format=" + TAG_FORMAT, "refs/tags").splitlines():
        if not line.strip():
            continue
        name, sha, date = line.split("\t")
        tags.append((name, sha))
        lib.store_raw(con, run_id, "tag", full, name,
                      {"name": name, "sha": sha, "date": to_utc_z(date)})
    print(f"{full}: {len(tags)} tags")

    head_branch = git(mirror, "symbolic-ref", "HEAD").strip().replace("refs/heads/", "")

    refs = [(t, t) for t, _ in tags] + [("HEAD", f"refs/heads/{head_branch}")]
    for ref, gitref in refs:
        for label, path in (("app", config.APP_CARGO_PATH), ("pins", config.PINS_CARGO_PATH)):
            try:
                text = git(mirror, "show", f"{gitref}:{path}")
            except RuntimeError:
                continue  # path missing at this old ref
            payload = {"ref": ref, "path": path, **parse_cargo(text)}
            lib.store_raw(con, run_id, "cargo_toml", full, f"{ref}:{label}", payload)
    print(f"{full}: cargo snapshots at {len(refs)} refs")


def main() -> int:
    with lib.Run("fetch_local_git") as con:
        run_id = con.execute("SELECT MAX(id) FROM sync_run").fetchone()[0]
        for repo in config.SOURCE_REPOS:
            if repo["kind"] == "app":
                collect_app_repo(con, run_id, repo)
            else:
                fresh_clone(repo)  # dep versions come from crates.io
        con.commit()
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Collect PRs and GitHub releases (bronze layer) via the REST API.

Unauthenticated budget is 60 req/h — this script is deliberately the only API
consumer: tags/Cargo come from git mirrors (fetch_local_git), dependency
versions from crates.io (fetch_crates).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
import lib


def fetch_repo(con, run_id: int, repo: dict) -> None:
    full = config.repo_full(repo)

    print(f"{full}: pull requests ...")
    prs = lib.gh_get_paged(f"/repos/{full}/pulls?state=all&sort=updated&direction=desc")
    for pr in prs:
        lib.store_raw(con, run_id, "pull_request", full, pr["number"], pr)
    print(f"{full}: {len(prs)} PRs")

    print(f"{full}: releases ...")
    rels = lib.gh_get_paged(f"/repos/{full}/releases?per_page=100")
    for r in rels:
        lib.store_raw(con, run_id, "release", full, r["tag_name"] or r["id"], r)
    print(f"{full}: {len(rels)} releases")


def main() -> int:
    with lib.Run("fetch_github") as con:
        run_id = con.execute("SELECT MAX(id) FROM sync_run").fetchone()[0]
        for repo in config.SOURCE_REPOS:
            fetch_repo(con, run_id, repo)
        con.commit()
    return 0


if __name__ == "__main__":
    sys.exit(main())

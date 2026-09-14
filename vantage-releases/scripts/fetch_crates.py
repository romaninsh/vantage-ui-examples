#!/usr/bin/env python3
"""Collect dependency crate version history from crates.io (bronze layer).

The vantage-* crates publish independently from the deps monorepo, so
crates.io publish timestamps are the authoritative cut dates for assigning
dep-repo PRs to crate releases.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
import lib

CRATES_API = "https://crates.io/api/v1/crates"


def main() -> int:
    with lib.Run("fetch_crates") as con:
        run_id = con.execute("SELECT MAX(id) FROM sync_run").fetchone()[0]
        for crate in config.DEPENDENCY_CRATES:
            print(f"crates.io: {crate} ...")
            data = lib.http_get_json(f"{CRATES_API}/{crate}/versions?per_page=100")
            versions = data.get("versions", [])
            kept = 0
            for v in versions:
                if v.get("yanked"):
                    continue
                lib.store_raw(con, run_id, "crate_version", crate, v["num"],
                              {"num": v["num"], "created_at": v.get("created_at")})
                kept += 1
            print(f"  {kept} versions (+{len(versions) - kept} yanked)")
        con.commit()
    return 0


if __name__ == "__main__":
    sys.exit(main())

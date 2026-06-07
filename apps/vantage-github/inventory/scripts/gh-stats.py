#!/usr/bin/env python3
"""Helper for the vantage-github example's cmd datasource.

Wraps the `gh` CLI and extracts build-cache / compile stats out of GitHub
Actions run logs, so the table's Rhai script stays trivial. Doing the parsing
here (in Python, where we can strip ANSI cleanly and debug standalone) is far
easier than matching ANSI-laced substrings inside Rhai.

Usage:
    gh-stats.py runs <workflow_id> [repo]

`repo` defaults to romaninsh/vantage-ui and is overridable so the same helper
works across repos (wired into Vantage as a `repo` condition). Emits a JSON
array of run rows on stdout. Exits non-zero with a message on stderr if `gh`
fails, which the Rhai script surfaces into the Vantage logs.

Why the extra columns: a `full match: true` cache restore does NOT guarantee
cargo actually reused it. When every fingerprint misses, the build recompiles
from proc-macro2 upward even though the cache was restored. So we surface both
halves of the story:
  * cache_match / cache_size / cache_key  -> did the cache RESTORE?
  * crates_compiled / build_time          -> did cargo actually REUSE it?
  * cache_effective                       -> the derived verdict (restore AND
                                             reuse), which is what you actually
                                             care about.
The cache key splits into <env_hash>-<lock_hash>; surfacing those two lets you
see *which* half of the key moved between runs (toolchain/env vs Cargo.lock).
"""

import json
import re
import subprocess
import sys

DEFAULT_REPO = "romaninsh/vantage-ui"
RUN_LIMIT = 8

# A build that recompiles more than this many crates clearly didn't reuse the
# restored cache (a healthy incremental build touches a handful). Tunable.
EFFECTIVE_MAX_COMPILED = 60

# Matches CSI SGR escape sequences (the colour codes cargo/gh emit), e.g.
# "\x1b[1m", "\x1b[92m", "\x1b[0m" — stripping them makes the log plain text.
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def gh(*args: str) -> subprocess.CompletedProcess:
    """Run `gh` with the given args, capturing stdout/stderr as text."""
    return subprocess.run(
        ["gh", *args],
        capture_output=True,
        text=True,
    )


def split_cache_key(key: str) -> tuple:
    """Split a rust-cache key's trailing <env_hash>-<lock_hash> pair.

    Key shape: v0-rust-<shared>-<os>-<arch>-<env_hash>-<lock_hash>. The last two
    dash-separated tokens are the rust-environment hash and the Cargo.lock hash;
    everything before is static config. Returns ("", "") if it doesn't parse.
    """
    parts = key.split("-")
    if len(parts) >= 2:
        return parts[-2], parts[-1]
    return "", ""


def parse_log(log: str) -> dict:
    """Pull cache restore + actual-reuse signals out of a run log."""
    cache_size = ""
    cache_match = ""
    cache_key = ""
    env_hash = ""
    lock_hash = ""
    build_time = ""
    crates_compiled = 0

    for raw in log.splitlines():
        line = ANSI_RE.sub("", raw)

        if "Cache Size: " in line:
            # "... Cache Size: ~1431 MB (1501212345 B)" -> "~1431 MB"
            after = line.split("Cache Size: ", 1)[1]
            cache_size = after.split(" (", 1)[0].strip()

        if "Restored from cache key " in line:
            # '... Restored from cache key "v0-rust-...-3a8c1067-faf65518" full match: true.'
            m = re.search(r'Restored from cache key "([^"]+)"', line)
            if m:
                cache_key = m.group(1)
                env_hash, lock_hash = split_cache_key(cache_key)
            if "full match: " in line:
                cache_match = "full" if "full match: true" in line else "partial"

        if "`dev` profile" in line or "`release` profile" in line:
            if " in " in line and "Finished" in line:
                # "Finished `release` profile [...] target(s) in 13m 15s" -> "13m 15s"
                build_time = line.rsplit(" in ", 1)[1].strip()

        if re.search(r"\bCompiling\b", line):
            crates_compiled += 1

    cache_effective = (
        cache_match == "full" and crates_compiled <= EFFECTIVE_MAX_COMPILED
    )

    return {
        "cache_size": cache_size,
        "cache_match": cache_match,
        "cache_key": cache_key,
        "env_hash": env_hash,
        "lock_hash": lock_hash,
        "build_time": build_time,
        "crates_compiled": crates_compiled,
        "cache_effective": cache_effective,
    }


def runs(workflow_id: str, repo: str) -> list:
    """List recent runs for a workflow, each enriched with parsed log stats."""
    listing = gh(
        "run", "list",
        "--repo", repo,
        "--workflow", str(workflow_id),
        "--limit", str(RUN_LIMIT),
        "--json", "status,conclusion,databaseId,number,headBranch,headSha,startedAt",
    )
    if listing.returncode != 0:
        sys.stderr.write(listing.stderr)
        sys.exit(listing.returncode)

    rows = []
    for item in json.loads(listing.stdout):
        db_id = item["databaseId"]
        row = {
            "database_id": db_id,
            "workflow_id": int(workflow_id),
            "repo": repo,
            "run_number": item["number"],
            "head_branch": item["headBranch"],
            "head_sha": (item.get("headSha") or "")[:8],
            "conclusion": item["conclusion"] or item["status"],
            "started_at": item["startedAt"],
            "cache_size": "",
            "cache_match": "",
            "cache_key": "",
            "env_hash": "",
            "lock_hash": "",
            "build_time": "",
            "crates_compiled": 0,
            "cache_effective": False,
        }

        log = gh("run", "view", str(db_id), "--repo", repo, "--log")
        if log.returncode == 0:
            row.update(parse_log(log.stdout))

        rows.append(row)

    return rows


def main(argv: list) -> int:
    if len(argv) >= 2 and argv[0] == "runs":
        repo = argv[2] if len(argv) >= 3 and argv[2] else DEFAULT_REPO
        json.dump(runs(argv[1], repo), sys.stdout)
        return 0

    sys.stderr.write(f"usage: {sys.argv[0]} runs <workflow_id> [repo]\n")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

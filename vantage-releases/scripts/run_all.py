#!/usr/bin/env python3
"""Run the whole pipeline:
create_db -> fetch_local_git -> fetch_github -> fetch_crates -> transform -> build_changelog.

Usage: python3 scripts/run_all.py
GITHUB_TOKEN is optional; git mirrors and crates.io need no token.
"""

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEPS = ["create_db.py", "fetch_local_git.py", "fetch_github.py", "fetch_crates.py",
         "transform.py", "build_changelog.py"]


def main() -> int:
    for step in STEPS:
        print(f"\n=== {step} ===")
        rc = subprocess.run([sys.executable, str(HERE / step)]).returncode
        if rc != 0:
            print(f"{step} failed with rc={rc}; stopping", file=sys.stderr)
            return rc
    print("\npipeline complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())

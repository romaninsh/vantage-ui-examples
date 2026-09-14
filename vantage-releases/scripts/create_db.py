#!/usr/bin/env python3
"""Create (or migrate-in-place) the SQLite warehouse at data/vantage.sqlite.

Idempotent: schema.sql uses CREATE TABLE IF NOT EXISTS, so this is safe to
re-run at any time. Run this before anything else.
"""

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lib


def main() -> int:
    con = lib.connect()
    con.executescript(lib.SCHEMA_PATH.read_text())
    con.commit()
    tables = [
        r[0]
        for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
    ]
    print(f"{lib.DB_PATH}")
    print("tables: " + ", ".join(tables))
    con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

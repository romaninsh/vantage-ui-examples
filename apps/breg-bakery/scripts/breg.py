"""Shared plumbing for the Breg magic scripts (promotion / restock /
chase): the ANSI toolkit, the graceful-stop flag, and the surreal CLI
wrappers.

seed.py predates this module and stays standalone on purpose — it also
runs outside the composer stack (a laptop `seed.py --dry-run`), where
nothing guarantees this file is importable.

State note: `INTERACTIVE` and `STOPPING` are module globals — read them
as `breg.INTERACTIVE` / `breg.STOPPING` (a `from breg import STOPPING`
copies the value at import time and never sees the Ctrl+C).
"""

import json
import os
import re
import signal
import subprocess
import sys
import time

# --- tiny ANSI toolkit -------------------------------------------------------

RESET, BOLD, DIM = "\x1b[0m", "\x1b[1m", "\x1b[2m"


def c256(n):
    return f"\x1b[38;5;{n}m"


PINK, GOLD, MINT, SKY, LAV, RED = c256(205), c256(220), c256(114), c256(75), c256(141), c256(203)

INTERACTIVE = False
STOPPING = False


def out(s):
    sys.stdout.write(s)
    sys.stdout.flush()


def install_sigint(message):
    """First Ctrl+C prints `message` and raises the STOPPING flag so
    loops finish their current unit and wind down; repeats are ignored
    (a container stop escalates on its own)."""

    def on_sigint(_s, _f):
        global STOPPING
        if STOPPING:
            return
        STOPPING = True
        out(message)

    signal.signal(signal.SIGINT, on_sigint)


def paced_sleep(seconds):
    """The one wait: nothing in non-interactive mode, and in interactive
    mode a sleep that keeps checking STOPPING so Ctrl+C lands fast."""
    if not INTERACTIVE:
        return
    end = time.time() + seconds
    while time.time() < end and not STOPPING:
        time.sleep(min(0.2, max(0.0, end - time.time())))


# --- surreal plumbing (seed.py's helpers, trimmed) ---------------------------


def conn_from_env():
    return dict(
        endpoint=os.environ.get("SURREAL_ENDPOINT", "ws://localhost:8000"),
        user=os.environ.get("SURREAL_USER", "root"),
        password=os.environ.get("SURREAL_PASS", "root"),
        ns=os.environ.get("SURREAL_NS", "bakery"),
        db=os.environ.get("SURREAL_DB", "v2"),
    )


def run_sql(sql, conn, want_json=False):
    cmd = ["surreal", "sql", "--endpoint", conn["endpoint"],
           "--user", conn["user"], "--pass", conn["password"],
           "--ns", conn["ns"], "--db", conn["db"]]
    if want_json:
        cmd.append("--json")
    res = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    blob = (res.stdout or "") + (res.stderr or "")
    if res.returncode != 0 or "Parse error" in blob or '"status":"ERR"' in blob:
        sys.stderr.write(blob + "\n")
        raise SystemExit(f"surreal sql failed (exit {res.returncode}) — see above")
    return res.stdout


def query_rows(sql, conn):
    """Rows of a single-statement query. `--json` prints one outer
    array per statement, each holding its rows: `[[{...}, {...}]]`."""
    raw = run_sql(sql, conn, want_json=True)
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("["):
            parsed = json.loads(line)
            if parsed and isinstance(parsed[0], list):
                return parsed[0]
            return parsed
    return []


def esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


def dt_literal(d):
    return 'd"' + d.strftime("%Y-%m-%dT%H:%M:%SZ") + '"'


def normalize_bakery(v):
    """Accept `leeds`, `Leeds` or `bakery:leeds` on the CLI.

    Rejects anything outside the record-id grammar before the value is
    interpolated into SurrealQL — the UI sends real record ids, so this
    only ever trips on a hand-typed CLI value.
    """
    rid = v if ":" in v else f"bakery:{v.lower()}"
    if not re.fullmatch(r"bakery:[a-z0-9_]+", rid):
        raise SystemExit(f"not a bakery record id: {v!r} (expected e.g. bakery:leeds)")
    return rid

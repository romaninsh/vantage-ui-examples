#!/usr/bin/env python3
"""The muffin baker, grown up: an animated oven that actually restocks.

Direct descendant of the old bake-muffins demo (spinners, in-place
progress, colours) — but every finished batch now lands as a real
`UPDATE product SET inventory.stock += qty`, so the low-stock list
shortens while you watch. It always bakes what the shop needs most:
each round re-reads stock and picks from the emptiest shelves.

`--batches 0` bakes until stopped — run it as a background job and end
it from the Services page (Ctrl+C bakes out the batch in the oven,
then cools down; the same graceful stop the old baker had).

Connection via env, same as seed.py / promotion.py.
"""

import argparse
import json
import os
import random
import signal
import subprocess
import sys
import time

RESET, BOLD, DIM = "\x1b[0m", "\x1b[1m", "\x1b[2m"


def c256(n):
    return f"\x1b[38;5;{n}m"


GOLD, MINT, SKY, RED = c256(220), c256(114), c256(75), c256(203)

INTERACTIVE = False
STOPPING = False


def out(s):
    sys.stdout.write(s)
    sys.stdout.flush()


def on_sigint(_s, _f):
    global STOPPING
    if STOPPING:
        return
    STOPPING = True
    out(f"\r\n{BOLD}{SKY}🧊 stop received{RESET} — baking out the batch in the "
        f"oven, then cooling down…\r\n")


signal.signal(signal.SIGINT, on_sigint)


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
    raw = run_sql(sql, conn, want_json=True)
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("["):
            parsed = json.loads(line)
            if parsed and isinstance(parsed[0], list):
                return parsed[0]
            return parsed
    return []


def lowest_stock(bakery, conn, n=8):
    rows = query_rows(
        f"SELECT id, name, inventory.stock AS stock FROM product "
        f"WHERE bakery = {bakery} ORDER BY stock ASC LIMIT {n};", conn)
    return [(str(r["id"]), r["name"], int(r.get("stock") or 0)) for r in rows]


def bake_bar(name, seconds):
    """One oven cycle, redrawn in place. Non-interactive: instant."""
    if not INTERACTIVE:
        return
    steps = 24
    for k in range(steps + 1):
        pct = k / steps
        filled = int(pct * steps)
        bar = "█" * filled + "░" * (steps - filled)
        out(f"\r  {GOLD}🔥 {bar}{RESET} {DIM}{name}{RESET} {int(pct * 100):3d}%")
        time.sleep(seconds / steps)
    out("\r\x1b[2K")


def main():
    global INTERACTIVE
    ap = argparse.ArgumentParser()
    ap.add_argument("--bakery", required=True, help="record id, e.g. bakery:leeds")
    ap.add_argument("--batches", type=int, default=8,
                    help="oven runs; 0 = keep baking until stopped")
    ap.add_argument("--interactive", action="store_true")
    args = ap.parse_args()
    INTERACTIVE = args.interactive
    conn = conn_from_env()
    bakery = args.bakery if ":" in args.bakery else f"bakery:{args.bakery}"

    shops = query_rows(f"SELECT name FROM {bakery};", conn)
    if not shops:
        raise SystemExit(f"no such bakery: {bakery}")
    out(f"{BOLD}{GOLD}🥖 ovens on{RESET} at {BOLD}{shops[0]['name']}{RESET} — "
        f"restocking the emptiest shelves first\r\n\r\n")

    baked = 0
    while not STOPPING and (args.batches == 0 or baked < args.batches):
        shelves = lowest_stock(bakery, conn)
        if not shelves:
            out(f"{RED}no products found — seed the catalog first{RESET}\r\n")
            return
        # Weight toward the emptiest shelf, with a little chaos.
        pid, name, stock = random.choice(shelves[:4])
        qty = random.choice([24, 36, 48, 60])
        bake_bar(name, random.uniform(1.5, 3.0))
        run_sql(f"UPDATE {pid} SET inventory.stock += {qty};", conn)
        baked += 1
        out(f"  {MINT}✓ batch {baked}{RESET} — {qty} × {name} "
            f"{DIM}(shelf: {stock} → {stock + qty}){RESET}\r\n")
        if INTERACTIVE:
            time.sleep(random.uniform(0.4, 1.2))

    out(f"\r\n{BOLD}{SKY}🧊 ovens cooling{RESET} — {baked} batch(es) on the "
        f"shelves.\r\n")


if __name__ == "__main__":
    main()

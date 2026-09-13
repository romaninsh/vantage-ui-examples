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
import random
import time

import breg
from breg import (BOLD, DIM, GOLD, MINT, RED, RESET, SKY,
                  conn_from_env, out, query_rows, run_sql)

breg.install_sigint(
    f"\r\n{BOLD}{SKY}🧊 stop received{RESET} — baking out the batch in the "
    f"oven, then cooling down…\r\n")


def lowest_stock(bakery, conn, n=8):
    rows = query_rows(
        f"SELECT id, name, inventory.stock AS stock FROM product "
        f"WHERE bakery = {bakery} ORDER BY stock ASC LIMIT {n};", conn)
    return [(str(r["id"]), r["name"], int(r.get("stock") or 0)) for r in rows]


def bake_bar(name, seconds):
    """One oven cycle, redrawn in place. Non-interactive: instant."""
    if not breg.INTERACTIVE:
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
    ap = argparse.ArgumentParser()
    ap.add_argument("--bakery", required=True, help="record id, e.g. bakery:leeds")
    ap.add_argument("--batches", type=int, default=8,
                    help="oven runs; 0 = keep baking until stopped")
    ap.add_argument("--interactive", action="store_true")
    args = ap.parse_args()
    breg.INTERACTIVE = args.interactive
    conn = conn_from_env()
    bakery = breg.normalize_bakery(args.bakery)

    shops = query_rows(f"SELECT name FROM {bakery};", conn)
    if not shops:
        raise SystemExit(f"no such bakery: {bakery}")
    out(f"{BOLD}{GOLD}🥖 ovens on{RESET} at {BOLD}{shops[0]['name']}{RESET} — "
        f"restocking the emptiest shelves first\r\n\r\n")

    baked = 0
    while not breg.STOPPING and (args.batches == 0 or baked < args.batches):
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
        breg.paced_sleep(random.uniform(0.4, 1.2))

    out(f"\r\n{BOLD}{SKY}🧊 ovens cooling{RESET} — {baked} batch(es) on the "
        f"shelves.\r\n")


if __name__ == "__main__":
    main()

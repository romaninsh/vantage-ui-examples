#!/usr/bin/env python3
"""Chase the aged-debt list: persuade accounts to pay their invoices.

The gentler sibling of promotion.py — same container, same live-write
trick, opposite direction: it reads every issued invoice that still
has money outstanding and works the phones. Some accounts settle in
full, some scrape half together, and some were apparently never born.
Every settlement is a real `payment` row, so the "Owed by accounts"
tile shrinks while you watch.

Approaches change the odds, not the honesty:
    gentle  a friendly reminder email      (~45% collect something)
    firm    a letter mentioning "terms"    (~65%)
    calls   ringing them at lunchtime      (~80%, and the best excuses)
"""

import argparse
import json
import os
import random
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone

RESET, BOLD, DIM = "\x1b[0m", "\x1b[1m", "\x1b[2m"


def c256(n):
    return f"\x1b[38;5;{n}m"


GOLD, MINT, SKY, RED, LAV = c256(220), c256(114), c256(75), c256(203), c256(141)

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
    out(f"\r\n{BOLD}{SKY}📞 phones down{RESET} — finishing the current "
        f"call…\r\n")


signal.signal(signal.SIGINT, on_sigint)


def beat(seconds):
    if INTERACTIVE:
        time.sleep(seconds)


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


def dt_literal(d):
    return 'd"' + d.strftime("%Y-%m-%dT%H:%M:%SZ") + '"'


ODDS = {
    # (pay in full, pay part) — the rest promise and vanish.
    "gentle": (0.25, 0.20),
    "firm": (0.40, 0.25),
    "calls": (0.55, 0.25),
}

OPENERS = {
    "gentle": ["a friendly nudge lands in the inbox of",
               "a polite reminder, with a smiley, reaches"],
    "firm": ["a letter that uses the word “terms” twice arrives at",
             "an email with the accounts team in CC finds"],
    "calls": ["the phone rings at lunchtime at",
              "someone picks up on the fourth ring at"],
}

EXCUSES = [
    "“the cheque is in the post” (there is no cheque)",
    "“invoice? which invoice?” — attachment re-sent, hope dims",
    "the goat ate the paperwork, allegedly",
    "they put us on hold and never came back",
    "“call back after the wedding season”",
]

WINS = [
    "pays on the spot, apologises twice",
    "settles it — “thought we'd paid that months ago!”",
    "grumbles about the croissant prices, pays anyway",
]


def main():
    global INTERACTIVE
    ap = argparse.ArgumentParser()
    ap.add_argument("--approach", choices=list(ODDS), default="firm")
    ap.add_argument("--limit", type=int, default=10, help="accounts to chase")
    ap.add_argument("--interactive", action="store_true")
    args = ap.parse_args()
    INTERACTIVE = args.interactive
    conn = conn_from_env()

    rows = query_rows(
        "SELECT id, number, total, client, client.name AS client_name, "
        "((SELECT VALUE math::sum(amount) FROM payment WHERE invoice = $parent.id "
        "GROUP ALL)[0] ?? 0) AS paid "
        "FROM invoice WHERE status = 'issued' LIMIT 500;", conn)
    owed = [(str(r["id"]), r["number"], r.get("client_name") or "an account",
             str(r["client"]), int(r["total"]) - int(r["paid"]))
            for r in rows if int(r["total"]) - int(r["paid"]) > 0]
    random.shuffle(owed)
    owed = owed[: args.limit]

    full_p, part_p = ODDS[args.approach]
    run_id = format(int(time.time()) % 36**5, "x")
    out(f"{BOLD}{GOLD}☎️  COLLECTIONS{RESET} — approach: {args.approach}, "
        f"{len(owed)} account(s) on the list\r\n")
    beat(0.8)

    collected = 0
    for i, (iid, number, client, cid, balance) in enumerate(owed):
        if STOPPING:
            break
        opener = random.choice(OPENERS[args.approach])
        out(f"\r\n{SKY}{opener} {BOLD}{client}{RESET}{SKY} "
            f"({number}, £{balance / 100:.2f} outstanding){RESET}\r\n")
        beat(0.9)
        roll = random.random()
        now = datetime.now(timezone.utc)
        # The trailing UPDATE is the change-handling trick: the client's
        # balance is computed on read, and the live feed only fires for
        # the client's own row — touching it makes the grid re-read.
        if roll < full_p:
            method = random.choice(["bank_transfer", "card"])
            run_sql(
                f"INSERT INTO payment [ {{ id: payment:chase_{run_id}_{i:04d}, "
                f"invoice: {iid}, paid_at: {dt_literal(now)}, amount: {balance}, "
                f'method: "{method}" }} ];'
                f"UPDATE {cid} SET deps_last_updated = time::now();", conn)
            collected += balance
            out(f"   {MINT}💷 {random.choice(WINS)}{RESET} — £{balance / 100:.2f}\r\n")
        elif roll < full_p + part_p:
            part = max(1, int(balance * random.uniform(0.3, 0.6)))
            run_sql(
                f"INSERT INTO payment [ {{ id: payment:chase_{run_id}_{i:04d}, "
                f"invoice: {iid}, paid_at: {dt_literal(now)}, amount: {part}, "
                f'method: "cheque" }} ];'
                f"UPDATE {cid} SET deps_last_updated = time::now();", conn)
            collected += part
            out(f"   {LAV}💷 finds £{part / 100:.2f} of £{balance / 100:.2f}{RESET}"
                f" — “the rest next week, promise”\r\n")
        else:
            out(f"   {RED}✗ {random.choice(EXCUSES)}{RESET}\r\n")
        beat(0.6)

    out(f"\r\n{BOLD}{GOLD}📒 day's takings: £{collected / 100:.2f}{RESET} — "
        f"the aged-debt list is what it is.\r\n")


if __name__ == "__main__":
    main()

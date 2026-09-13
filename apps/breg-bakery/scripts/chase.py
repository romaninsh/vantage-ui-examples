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
import random
import time
from datetime import datetime, timezone

import breg
from breg import (BOLD, GOLD, LAV, MINT, RED, RESET, SKY,
                  conn_from_env, dt_literal, out, query_rows, run_sql)

beat = breg.paced_sleep

breg.install_sigint(
    f"\r\n{BOLD}{SKY}📞 phones down{RESET} — finishing the current "
    f"call…\r\n")


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
    ap = argparse.ArgumentParser()
    ap.add_argument("--approach", choices=list(ODDS), default="firm")
    ap.add_argument("--limit", type=int, default=10, help="accounts to chase")
    ap.add_argument("--interactive", action="store_true")
    args = ap.parse_args()
    breg.INTERACTIVE = args.interactive
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
        if breg.STOPPING:
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

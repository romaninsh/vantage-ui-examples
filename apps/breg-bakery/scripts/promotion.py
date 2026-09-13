#!/usr/bin/env python3
"""Run an ad campaign for one bakery and watch the clients roll in.

The interactive mode is a show: each signup is a person with a story —
spotted the billboard on the ring road, heard the jingle between songs,
tore the coupon out of the paper — typed out live in colour while the
real rows land in SurrealDB behind it. Keep the Clients grid open: it
follows the change feed, so every signup appears the moment it is
written. Orders, a consolidated invoice and (sometimes) a payment
follow — and things go wrong on purpose: vans hit roadworks, cheques
bounce, somebody ghosts the invoice into the aged-debt list.

Non-interactive (`--interactive` omitted) is the same generator with
the theatre removed — bulk rows, no delays — which is what makes it
reusable as a seeding routine.

Record shapes are seed.py's, verbatim (client / order+lines / `placed`
edge / invoice / payment); if seed.py's schema moves, move this too.

The campaign runs for `--days` and then it's over — once it's gone,
it's gone: the script ends, no daemon lingers, and the only trace is
the clients it signed.

Usage (inside the composer stack's seed container):
    promotion.py --bakery bakery:leeds --slogan "Rise & Shine, Leeds!" \
        --billboards 3 --newspaper "Yorkshire Post" --days 14 --interactive

Connection via env (compose sets these): SURREAL_ENDPOINT, SURREAL_USER,
SURREAL_PASS, SURREAL_NS, SURREAL_DB.
"""

import argparse
import random
import time
from datetime import datetime, timedelta, timezone

import breg
from breg import (BOLD, DIM, GOLD, LAV, MINT, PINK, RED, RESET, SKY,
                  conn_from_env, dt_literal, esc, out, query_rows, run_sql)

beat = breg.paced_sleep

breg.install_sigint(
    f"\r\n{BOLD}{SKY}📉 budget pulled{RESET} — the billboards come down "
    f"after the current signup…\r\n")


def say(s, pace=0.012):
    """Typewriter in interactive mode; plain print otherwise."""
    if not breg.INTERACTIVE:
        print(s.replace("\r", ""))
        return
    for ch in s:
        out(ch)
        if pace and ch not in "\x1b[":
            time.sleep(pace if ch != " " else pace / 2)
    out("\r\n")


# --- the campaign -----------------------------------------------------------

FIRST = ["Sue", "Priya", "Marcus", "Fern", "Olly", "Agnieszka", "Dev", "Rosa",
         "Callum", "Ingrid", "Tariq", "Maeve", "Stan", "Yuki", "Bernadette"]
LAST = ["Doe", "Okafor", "Kowalski", "Braithwaite", "Nguyen", "McTavish",
        "Silva", "Hargreaves", "Osei", "Lindqvist", "Patel", "Crumb"]
OUTFITS = ["office manager", "school cook", "cafe owner", "gym receptionist",
           "wedding planner", "5-a-side team captain", "church warden",
           "co-working host", "allotment society treasurer"]

HOOKS = {
    "billboard": [
        "was stuck in traffic under the ring-road billboard for eleven minutes",
        "saw the billboard from the top deck of the number 42",
        "walked past the billboard twice, then turned around",
        "photographed the platform poster instead of the train times",
    ],
    "newspaper": [
        "tore the coupon out of the paper over breakfast",
        "read the half-page ad in the dentist's waiting room",
        "did the crossword next to the ad and kept both",
    ],
    "radio": [
        "caught the jingle between songs and hasn't stopped humming it",
        "heard the breakfast-show host mispronounce “croissant” twice",
    ],
    "word-of-mouth": [
        "heard about the slogan from a colleague who wouldn't stop saying it",
        "got forwarded a photo of the ad in the family group chat",
    ],
}

MISHAPS = [
    ("out_of_stock", "the counter sold out before the order was picked"),
    ("late_delivery", "the van met the roadworks on Kirkstall Road"),
    ("customer_changed_mind", "the office diet started on Monday. Again."),
]


def pick_hook(channels):
    return random.choice(HOOKS[random.choice(channels)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bakery", required=True, help="record id, e.g. bakery:leeds")
    ap.add_argument("--slogan", default="Fresh. Local. Yours.")
    ap.add_argument("--channels", default="billboard,word-of-mouth",
                    help="comma list: billboard, newspaper, radio, word-of-mouth")
    ap.add_argument("--minutes", type=float, default=3.0,
                    help="real-time campaign length; signups are paced across it")
    ap.add_argument("--clients", type=int, default=0,
                    help="override signup count (0 = derive from the media mix)")
    ap.add_argument("--interactive", action="store_true")
    args = ap.parse_args()
    breg.INTERACTIVE = args.interactive

    channels = [c.strip() for c in args.channels.split(",") if c.strip() in HOOKS]
    if not channels:
        channels = ["word-of-mouth"]

    conn = conn_from_env()
    bakery = breg.normalize_bakery(args.bakery)

    shops = query_rows(f"SELECT name FROM {bakery};", conn)
    if not shops:
        raise SystemExit(f"no such bakery: {bakery}")
    shop_name = shops[0]["name"]

    prods = query_rows(
        f"SELECT id, price FROM product WHERE bakery = {bakery} LIMIT 200;", conn)
    products = [(str(p["id"]), int(p["price"])) for p in prods]
    if not products:
        raise SystemExit(f"{shop_name} has no products — seed the database first")

    signups = args.clients or max(2, round(args.minutes * (1 + len(channels))))
    # Real-time pacing: the campaign occupies its whole window, so the
    # grid keeps receiving rows for as long as the ad runs — and Stop
    # (Services page) is the early exit.
    gap = (args.minutes * 60.0) / max(signups, 1)
    run_id = format(int(time.time()) % 36**5, "x")

    say(f"{BOLD}{GOLD}📣  CAMPAIGN LIVE{RESET} for {BOLD}{shop_name}{RESET}")
    say(f'    slogan: {PINK}“{esc(args.slogan)}”{RESET}')
    say(f"    channels: {', '.join(channels)} · {args.minutes:g} min · "
        f"expecting ~{signups} signups")
    beat(1.0)

    campaign_start = time.time()
    started = []
    for i in range(signups):
        if breg.STOPPING:
            break
        if i > 0:
            breg.paced_sleep(gap * random.uniform(0.6, 1.4))
            if breg.STOPPING:
                break
        now = datetime.now(timezone.utc)
        elapsed = int(time.time() - campaign_start)
        name = f"{random.choice(FIRST)} {random.choice(LAST)}"
        outfit = random.choice(OUTFITS)
        hook = pick_hook(channels)

        say(f"\r\n{DIM}— t+{elapsed // 60}m{elapsed % 60:02d}s —{RESET}")
        say(f"{SKY}👤 {BOLD}{name}{RESET}{SKY}, {outfit},{RESET} {hook}.")
        beat(0.5)

        cid = f"client:promo_{run_id}_{i:04d}"
        email = f"{name.split()[0].lower()}.{i:03d}@{bakery.split(':')[1]}.breg.test"
        phone = f"0113 {random.randint(200, 999)} {random.randint(1000, 9999)}"
        paying = random.random() > 0.2
        run_sql(
            f"INSERT INTO client [ {{ id: {cid}, name: \"{esc(name)}\", "
            f'email: "{email}", contact_details: "{phone}", '
            f"is_paying_client: {str(paying).lower()}, bakery: {bakery} }} ];",
            conn)
        say(f"   {MINT}✓ signed up{RESET} — {DIM}{email} · {phone}{RESET}")
        beat(0.4)

        # First orders, placed during the campaign window.
        net_total = 0
        n_orders = random.choices([0, 1, 2, 3], weights=[10, 55, 25, 10])[0]
        for k in range(n_orders):
            lines, seen, net = [], set(), 0
            for _ in range(random.randint(1, 3)):
                pid, price = random.choice(products)
                if pid in seen:
                    continue
                seen.add(pid)
                qty = random.choices([2, 6, 12, 24], weights=[30, 40, 20, 10])[0]
                lines.append(f"{{ product: {pid}, quantity: {qty}, price: {price} }}")
                net += qty * price
            placed_at = now + timedelta(seconds=random.uniform(0, 30))
            mishap = random.random() < 0.18
            status = "cancelled" if mishap else random.choice(
                ["picked_up", "delivered", "delivered", "placed"])
            cancel = ""
            if mishap:
                reason, story = random.choice(MISHAPS)
                cancel = f', cancellation_reason: "{reason}"'
            oid = f"order:promo_{run_id}_{i:04d}_{k}"
            # The trailing UPDATE is the change-handling trick: the
            # client's aggregates (order_count, balance) are computed
            # on read, and SurrealDB's live feed only fires for the
            # client's OWN row — so every write that affects a
            # client's numbers touches the client, and the grid
            # re-reads it fresh.
            run_sql(
                f"INSERT INTO order [ {{ id: {oid}, bakery: {bakery}, client: {cid}, "
                f"created_at: {dt_literal(placed_at)}, is_deleted: false, "
                f'status: "{status}"{cancel}, lines: [ {", ".join(lines)} ] }} ];'
                f"INSERT RELATION INTO placed [ {{ in: {cid}, out: {oid} }} ];"
                f"UPDATE {cid} SET deps_last_updated = time::now();",
                conn)
            if mishap:
                say(f"   {RED}✗ order cancelled{RESET} — {story}")
            else:
                say(f"   {LAV}🧺 order {k + 1}{RESET} — {len(lines)} line(s), "
                    f"£{net / 100:.2f} ({status.replace('_', ' ')})")
                if status in ("picked_up", "delivered"):
                    net_total += net
            beat(0.35)

        started.append((cid, name, net_total))

    # Campaign wrap: one invoice per client who actually took goods,
    # then the money — or the excuses.
    billed = [(c, n, t) for c, n, t in started if t > 0]
    now = datetime.now(timezone.utc)
    say(f"\r\n{BOLD}{GOLD}🧾 campaign wrap{RESET} — {len(started)} signup(s), "
        f"{len(billed)} to invoice")
    beat(0.8)
    # Billing always completes, even on an early stop — whoever took
    # goods gets invoiced; that's the whole lesson of the demo.
    for j, (cid, name, total) in enumerate(billed):
        iid = f"invoice:promo_{run_id}_{j:04d}"
        issued = now
        due = issued + timedelta(days=30)
        run_sql(
            f"INSERT INTO invoice [ {{ id: {iid}, bakery: {bakery}, client: {cid}, "
            f'number: "BRG-PROMO-{run_id.upper()}-{j:04d}", '
            f"issued_at: {dt_literal(issued)}, due_at: {dt_literal(due)}, "
            f'total: {total}, status: "issued" }} ];'
            f"UPDATE order SET invoice = {iid} WHERE client = {cid} "
            f"AND status IN ['picked_up', 'delivered'];"
            f"UPDATE {cid} SET deps_last_updated = time::now();",
            conn)
        roll = random.random()
        if roll < 0.5:
            method = random.choice(["card", "bank_transfer"])
            run_sql(
                f"INSERT INTO payment [ {{ id: payment:promo_{run_id}_{j:04d}, "
                f"invoice: {iid}, paid_at: {dt_literal(now)}, amount: {total}, "
                f'method: "{method}" }} ];'
                f"UPDATE {cid} SET deps_last_updated = time::now();", conn)
            say(f"   {MINT}💷 {name} settled £{total / 100:.2f}{RESET} by {method.replace('_', ' ')}")
        elif roll < 0.75:
            part = max(1, int(total * random.uniform(0.3, 0.7)))
            run_sql(
                f"INSERT INTO payment [ {{ id: payment:promo_{run_id}_{j:04d}, "
                f"invoice: {iid}, paid_at: {dt_literal(now)}, amount: {part}, "
                f'method: "cheque" }} ];'
                f"UPDATE {cid} SET deps_last_updated = time::now();", conn)
            say(f"   {GOLD}💷 {name} paid £{part / 100:.2f} of £{total / 100:.2f}{RESET}"
                f" — a cheque, 'the rest to follow'")
        else:
            say(f"   {RED}👻 {name} has gone quiet{RESET} — "
                f"£{total / 100:.2f} into the aged-debt list")
        beat(0.5)

    say(f"\r\n{BOLD}{PINK}🏁 the billboards come down.{RESET} "
        f"Once it's gone, it's gone — but the clients stay.")


if __name__ == "__main__":
    main()

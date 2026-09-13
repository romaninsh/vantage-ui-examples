#!/usr/bin/env python3
"""Seed the Breg bakery SurrealDB with a realistic trade-counter dataset.

Breg is a high-street bakery chain: a handful of shops, each stocking the
same catalogue at its own stock levels, selling to walk-in trade accounts
(offices, schools, cafes) that order in bulk and settle on account.

What makes the generated data worth looking at rather than merely present:

  * a real catalogue — the products, prices (in pence) and calories of a
    British high-street bakery, not random adjective-noun pairs;
  * demand that follows the trade: weekdays outsell weekends, breakfast
    items sell in the morning and savouries at lunch, and a shop's stock
    runs down on what it actually sells;
  * fulfilment that follows age — last week's orders were handed over, this
    morning's are still on the counter;
  * a real billing cycle: fulfilled orders consolidate into one invoice per
    account per month, and payments settle those invoices in full, in part,
    in instalments, or not at all — so the aged-debt list has every bucket.

Nothing stores a total. An order's value is its lines, an invoice's is its
orders, what is owed is that minus its payments. The query-sourced tables
work those out, which is why they cannot drift.

Usage:
    python3 seed.py xs            # 2 shops,  ~250 orders,  90-day window
    python3 seed.py m             # 6 shops,  ~4k orders,   1-year window
    python3 seed.py xl            # 8 shops,  ~40k orders,  2-year window
    python3 seed.py m --wipe      # clear the five tables first, then seed
    python3 seed.py --wipe-only   # just clear them

Connection defaults match the running app (override via flags or env):
    --endpoint ws://localhost:8000  --user root --pass root --ns bakery --db v2

This script MUTATES the database. It is not run automatically.
"""

import argparse
from dataclasses import dataclass
import os
import random
import subprocess
import sys
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------------- the chain

# (slug, shop name, profit margin %)
SHOPS = [
    ("newcastle", "Breg Grainger Street, Newcastle", 31),
    ("leeds", "Breg Briggate, Leeds", 29),
    ("manchester", "Breg Piccadilly Gardens, Manchester", 28),
    ("glasgow", "Breg Argyle Street, Glasgow", 30),
    ("birmingham", "Breg New Street, Birmingham", 26),
    ("bristol", "Breg Broadmead, Bristol", 25),
    ("cardiff", "Breg Queen Street, Cardiff", 27),
    ("sheffield", "Breg Fargate, Sheffield", 24),
]

# (slug, name, category, price in pence, kcal). Prices are stored in pence
# because the column is an int — a bakery that sells a £1.45 sausage roll
# cannot hold its prices in whole pounds.
CATALOGUE = [
    # Savouries — the volume line, and what the chain is known for.
    ("sausage_roll", "Sausage Roll", "Savouries", 145, 330),
    ("vegan_sausage_roll", "Vegan Sausage Roll", "Savouries", 145, 302),
    ("steak_bake", "Steak Bake", "Savouries", 240, 409),
    ("chicken_bake", "Chicken Bake", "Savouries", 240, 424),
    ("cheese_onion_bake", "Cheese & Onion Bake", "Savouries", 235, 438),
    ("sausage_bean_melt", "Sausage, Bean & Cheese Melt", "Savouries", 240, 465),
    ("festive_bake", "Festive Bake", "Savouries", 240, 458),
    # Breakfast — mornings only.
    ("bacon_roll", "Bacon Breakfast Roll", "Breakfast", 240, 327),
    ("sausage_roll_bfast", "Sausage Breakfast Roll", "Breakfast", 240, 388),
    ("omelette_roll", "Omelette Breakfast Roll", "Breakfast", 240, 357),
    ("bacon_sausage_roll", "Bacon & Sausage Breakfast Roll", "Breakfast", 260, 411),
    ("bacon_baguette", "Bacon Breakfast Baguette", "Breakfast", 320, 566),
    ("pain_au_chocolat", "Pain au Chocolat", "Breakfast", 140, 309),
    ("croissant", "All Butter Croissant", "Breakfast", 125, 367),
    ("hash_browns", "Hash Browns (2 pack)", "Breakfast", 130, 151),
    ("porridge", "Golden Syrup Porridge", "Breakfast", 175, 244),
    # Sandwiches — the lunch trade.
    ("tuna_cucumber", "Tuna Mayonnaise & Cucumber", "Sandwiches", 220, 334),
    ("egg_mayo", "Free Range Egg Mayo", "Sandwiches", 220, 356),
    ("chicken_bacon", "Roast Chicken Mayonnaise & Bacon", "Sandwiches", 220, 468),
    ("cheese_sandwich", "Cheese Sandwich", "Sandwiches", 145, 307),
    ("ham_sandwich", "Ham Sandwich", "Sandwiches", 145, 258),
    ("chicken_baguette", "Roast Chicken Mayonnaise Baguette", "Sandwiches", 320, 458),
    ("tandoori_baguette", "Tandoori Chicken Baguette", "Sandwiches", 320, 464),
    ("ham_cheese_toastie", "Ham & Mature Cheddar Toastie", "Sandwiches", 410, 468),
    # Pizza and hot food.
    ("margherita_slice", "Margherita Pizza Slice", "Hot Food", 240, 546),
    ("pepperoni_slice", "Pepperoni Pizza Slice", "Hot Food", 275, 611),
    ("spicy_veg_slice", "Spicy Veg Pizza Slice", "Hot Food", 275, 564),
    ("chicken_goujons", "Southern Fried Chicken Goujons", "Hot Food", 410, 394),
    ("bbq_chicken_bites", "Spicy BBQ Chicken Bites", "Hot Food", 235, 312),
    ("potato_wedges", "Southern Fried Potato Wedges", "Hot Food", 155, 278),
    ("tomato_soup", "Tomato Soup", "Hot Food", 275, 408),
    # Sweet.
    ("jam_doughnut", "Jam Doughnut", "Sweet", 115, 242),
    ("glazed_ring", "Glazed Ring Doughnut", "Sweet", 120, 213),
    ("caramel_custard", "Caramel Custard Doughnut", "Sweet", 150, 276),
    ("triple_choc_doughnut", "Triple Chocolate Doughnut", "Sweet", 150, 329),
    ("belgian_bun", "Belgian Bun", "Sweet", 155, 374),
    ("yum_yums", "Yum Yums (2 pack)", "Sweet", 175, 646),
    ("bakewell_muffin", "Cherry Bakewell Muffin", "Sweet", 150, 360),
    ("jammy_heart", "Jammy Heart Biscuit", "Sweet", 145, 273),
    # Drinks.
    ("regular_latte", "Regular Latte", "Drinks", 240, 111),
    ("large_latte", "Large Latte", "Drinks", 295, 133),
    ("regular_americano", "Regular Americano", "Drinks", 190, 9),
    ("regular_cappuccino", "Regular Cappuccino", "Drinks", 240, 94),
    ("regular_tea", "Regular Tea", "Drinks", 145, 9),
    ("hot_chocolate", "Regular Hot Chocolate", "Drinks", 240, 219),
    ("orange_juice", "Orange Juice", "Drinks", 185, 0),
    ("still_water", "Still Water", "Drinks", 140, 0),
]

# When each category sells. Orders are stamped inside one of these windows,
# which is what makes the revenue chart look like a bakery's day.
MORNING = (7, 11)
LUNCH = (11, 14)
ALLDAY = (7, 17)
CATEGORY_HOURS = {
    "Breakfast": MORNING,
    "Savouries": LUNCH,
    "Sandwiches": LUNCH,
    "Hot Food": LUNCH,
    "Sweet": ALLDAY,
    "Drinks": ALLDAY,
}
# Relative demand. Savouries and drinks carry the counter.
CATEGORY_WEIGHT = {
    "Savouries": 34, "Drinks": 22, "Breakfast": 16,
    "Sandwiches": 14, "Sweet": 10, "Hot Food": 4,
}

# Trade accounts, by the kind of organisation that runs one.
ACCOUNT_KINDS = [
    ("{} Facilities", ["Northumbria Assurance", "Tyne Software", "Quayside Legal",
                       "Pennine Logistics", "Aire Valley Media", "Deansgate Partners",
                       "Clyde Analytics", "Broad Street Chambers", "Harbourside Design"]),
    ("{} Staff Room", ["St Cuthbert's Academy", "Fenham Primary", "Hillhead High",
                       "Moseley Grammar", "Redland Comprehensive", "Cathays Sixth Form"]),
    ("{} Cafe", ["The Reading Room", "Platform 4", "Old Mill", "Corner House",
                 "Riverside", "Lantern", "Bookbinder's"]),
    ("{} Ward Kitchen", ["Royal Victoria Infirmary", "St James's", "Southmead",
                         "Queen Elizabeth", "Gartnavel"]),
]

# Fulfilment only. Whether an order has been *paid* is the invoice's
# business, not the order's — the two lifecycles move independently, and a
# single field could not hold both.
STATUSES_FULFILLED = ["picked_up", "delivered"]
STATUSES_FULFILLED_W = [45, 55]
STATUSES_INFLIGHT = ["placed", "confirmed", "in_production", "ready"]
STATUSES_INFLIGHT_W = [30, 26, 22, 22]

PAYMENT_METHODS = ["bank_transfer", "card", "cash", "cheque"]
PAYMENT_METHOD_W = [62, 20, 12, 6]
# Days a trade account gets to settle.
PAYMENT_TERMS_DAYS = 30

TIERS = {
    "xs": dict(shops=2, clients=12, orders=250, days=90),
    "m": dict(shops=6, clients=90, orders=4000, days=365),
    "xl": dict(shops=8, clients=400, orders=40000, days=730),
}


@dataclass
class Order:
    """One generated order, kept in Python so billing can group and total it
    without reading back what was just written."""

    oid: str
    shop: str
    client: str
    when: datetime
    status: str
    net: int
    sql: str


def dt_literal(d: datetime) -> str:
    return 'd"' + d.strftime("%Y-%m-%dT%H:%M:%SZ") + '"'


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def gen_shops(n):
    rows = []
    for slug, name, margin in SHOPS[:n]:
        rows.append(f'{{ id: bakery:{slug}, name: "{esc(name)}", profit_margin: {margin} }}')
    return rows, [s[0] for s in SHOPS[:n]]


def gen_products(shops):
    """One row per shop per catalogue line — a chain stocks the same menu,
    and each shop runs its own stock down."""
    rows, pool = [], {}
    for shop in shops:
        pool[shop] = []
        for slug, name, category, price, kcal in CATALOGUE:
            pid = f"product:{shop}_{slug}"
            # Fast movers run low; the slow tail sits deep. That is what puts
            # a believable handful of lines on the low-stock list.
            weight = CATEGORY_WEIGHT[category]
            stock = random.randint(0, 8) if random.random() < weight / 220 else random.randint(12, 240)
            rows.append(
                f'{{ id: {pid}, name: "{esc(name)}", price: {price}, calories: {kcal}, '
                f"is_deleted: false, inventory: {{ stock: {stock} }}, bakery: bakery:{shop} }}"
            )
            pool[shop].append((pid, price, category))
    return rows, pool


def gen_clients(n, shops):
    rows, pool = [], {s: [] for s in shops}
    used = set()
    for i in range(n):
        shop = shops[i % len(shops)]
        pattern, names = random.choice(ACCOUNT_KINDS)
        name = pattern.format(random.choice(names))
        cid = f"client:{shop}_{i:04d}"
        if name in used:
            name = f"{name} ({shop.title()})"
        used.add(name)
        # No stored balance. What an account owes is the unpaid part of its
        # invoices, worked out on read by `client_balances`.
        paying = random.random() > 0.15
        rows.append(
            f'{{ id: {cid}, name: "{esc(name)}", '
            f'email: "accounts{i:04d}@{shop}.breg.test", '
            f'contact_details: "0191 {random.randint(200, 999)} {random.randint(1000, 9999)}", '
            f"is_paying_client: {str(paying).lower()}, "
            f"bakery: bakery:{shop} }}"
        )
        pool[shop].append(cid)
    return rows, pool


def pick_category():
    cats = list(CATEGORY_WEIGHT)
    return random.choices(cats, weights=[CATEGORY_WEIGHT[c] for c in cats])[0]


def gen_orders(n, days, shops, clients, products):
    now = datetime.now(timezone.utc)
    orders, edges = [], []
    for i in range(n):
        shop = random.choice(shops)
        if not clients[shop]:
            continue
        client = random.choice(clients[shop])

        # Weekdays carry the trade: a Saturday is about half a Tuesday, and
        # Sunday less again. Resample rather than weight, so the date keeps
        # its uniform spread across the window.
        for _ in range(6):
            day_offset = random.uniform(0, days)
            when = now - timedelta(days=day_offset)
            weekday = when.weekday()
            keep = 1.0 if weekday < 5 else (0.5 if weekday == 5 else 0.3)
            if random.random() < keep:
                break

        category = pick_category()
        lo, hi = CATEGORY_HOURS[category]
        when = when.replace(hour=random.randrange(lo, hi),
                            minute=random.randrange(60),
                            second=random.randrange(60),
                            microsecond=0)

        # A basket is mostly one category plus the odd add-on — a tray of
        # sausage rolls and a couple of coffees, not a random walk.
        shop_products = products[shop]
        in_cat = [p for p in shop_products if p[2] == category] or shop_products
        line_count = random.choices([1, 2, 3, 4, 5], weights=[30, 30, 20, 13, 7])[0]
        chosen, line_amounts, seen = [], [], set()
        for k in range(line_count):
            src = in_cat if k == 0 or random.random() < 0.6 else shop_products
            pid, price, _ = random.choice(src)
            if pid in seen:
                continue
            seen.add(pid)
            # Trade quantities: a dozen is normal, a big tray happens.
            qty = random.choices([2, 6, 12, 24, 48], weights=[26, 34, 24, 12, 4])[0]
            # The line carries the price charged, so an invoice raised later
            # reflects the day's price and not today's.
            chosen.append(f"{{ product: {pid}, quantity: {qty}, price: {price} }}")
            line_amounts.append((qty, price))
        if not chosen:
            continue

        # Fulfilment follows age: last fortnight's orders have been handed
        # over, this morning's are still on the counter.
        if day_offset > 14:
            status = random.choices(STATUSES_FULFILLED, weights=STATUSES_FULFILLED_W)[0]
        elif day_offset > 2:
            status = random.choices(
                STATUSES_FULFILLED + STATUSES_INFLIGHT,
                weights=[26, 30, 12, 10, 12, 10])[0]
        else:
            status = random.choices(STATUSES_INFLIGHT, weights=STATUSES_INFLIGHT_W)[0]
        # A small, steady cancellation rate keeps the status colours honest.
        if random.random() < 0.03:
            status = "cancelled"

        oid = f"order:gen_o{i:06d}"
        cancel = ""
        if status == "cancelled":
            reason = random.choice(["out_of_stock", "customer_changed_mind", "late_delivery"])
            cancel = f', cancellation_reason: "{reason}"'
        net = sum(q * p for q, p in line_amounts)
        orders.append(
            Order(
                oid=oid,
                shop=shop,
                client=client,
                when=when,
                status=status,
                net=net,
                sql=(
                    f"{{ id: {oid}, bakery: bakery:{shop}, client: {client}, "
                    f"created_at: {dt_literal(when)}, is_deleted: false, "
                    f'status: "{status}"{cancel}, lines: [ {", ".join(chosen)} ] }}'
                ),
            )
        )
        edges.append(f"{{ in: {client}, out: {oid} }}")
    return orders, edges


def gen_billing(orders, days):
    """Consolidate fulfilled orders into monthly invoices, then pay some.

    A trade account is not invoiced per sausage roll: it gets one invoice a
    month covering everything it took, which is the only reason an invoice is
    worth being an entity of its own. Cancelled and unfulfilled orders are
    never billed.
    """
    now = datetime.now(timezone.utc)
    billable = [o for o in orders if o.status in STATUSES_FULFILLED]
    # One invoice per (client, calendar month).
    groups = {}
    for o in billable:
        groups.setdefault((o.client, o.shop, o.when.year, o.when.month), []).append(o)

    invoices, payments, attach = [], [], []
    seq = 0
    for (client, shop, year, month), group in sorted(groups.items(), key=lambda kv: str(kv[0])):
        # Issued at the start of the following month, payable in 30 days.
        issued = datetime(year, month, 1, 9, 0, 0, tzinfo=timezone.utc)
        issued = (issued.replace(day=28) + timedelta(days=8)).replace(day=1, hour=9)
        if issued > now:
            continue  # the month is not over; nothing billed yet
        due = issued + timedelta(days=PAYMENT_TERMS_DAYS)
        seq += 1
        iid = f"invoice:gen_i{seq:06d}"
        # The total is written onto the invoice, not derived from the orders
        # on every read. An issued invoice is a frozen document: editing an
        # order next March must not quietly change what was billed in
        # January. It is also what makes the page open — folding the line
        # arrays of every attached order took five seconds across the table.
        total = sum(o.net for o in group)
        invoices.append(
            f'{{ id: {iid}, bakery: bakery:{shop}, client: {client}, '
            f'number: "BRG-{year}{month:02d}-{seq:05d}", '
            f"issued_at: {dt_literal(issued)}, due_at: {dt_literal(due)}, "
            f'total: {total}, status: "issued" }}'
        )
        for o in group:
            attach.append(f"UPDATE {o.oid} SET invoice = {iid};")

        overdue = due < now
        # Settled, part-settled or not yet — weighted so the aged-debt list
        # has something in every bucket.
        roll = random.random()
        if roll < (0.80 if overdue else 0.45):
            share = 1.0
        elif roll < (0.92 if overdue else 0.70):
            share = random.uniform(0.25, 0.8)
        else:
            share = 0.0
        if share <= 0.0:
            continue
        amount = max(1, int(total * share))
        # A part-payment often arrives as two instalments.
        chunks = [amount] if share == 1.0 or random.random() < 0.6 else [
            amount // 2,
            amount - amount // 2,
        ]
        for k, chunk in enumerate(chunks):
            if chunk <= 0:
                continue
            paid = issued + timedelta(days=random.uniform(2, PAYMENT_TERMS_DAYS + 20))
            if paid > now:
                paid = now - timedelta(days=random.uniform(0, 3))
            method = random.choices(PAYMENT_METHODS, weights=PAYMENT_METHOD_W)[0]
            payments.append(
                f'{{ id: payment:gen_y{seq:06d}_{k}, invoice: {iid}, '
                f"paid_at: {dt_literal(paid)}, amount: {chunk}, "
                f'method: "{method}" }}'
            )
    return invoices, payments, attach


def chunked(rows, size):
    for i in range(0, len(rows), size):
        yield rows[i:i + size]


def run_sql(sql, conn, dry_run):
    if dry_run:
        return
    cmd = [
        "surreal", "sql",
        "--endpoint", conn["endpoint"],
        "--user", conn["user"], "--pass", conn["password"],
        "--ns", conn["ns"], "--db", conn["db"],
    ]
    res = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    out = (res.stdout or "") + (res.stderr or "")
    if res.returncode != 0 or "Parse error" in out or '"status":"ERR"' in out or "ERR" in res.stderr:
        sys.stderr.write(out + "\n")
        raise SystemExit(f"surreal sql failed (exit {res.returncode}) — see output above")


def emit(label, table, rows, conn, dry_run, size, relation=False):
    verb = "INSERT RELATION INTO" if relation else "INSERT INTO"
    total = 0
    for chunk in chunked(rows, size):
        run_sql(f"{verb} {table} [ {', '.join(chunk)} ];", conn, dry_run)
        total += len(chunk)
        print(f"  {label}: {total}/{len(rows)}", end="\r", flush=True)
    print(f"  {label}: {len(rows)} done            ")


def wipe(conn, dry_run):
    """Everything this script creates. All five tables are synthetic — there
    is no hand-authored record to preserve."""
    print("Clearing payments, invoices, orders, accounts, products and shops …")
    run_sql("\n".join([
        "DELETE payment;",
        "DELETE invoice;",
        "DELETE placed;",
        "DELETE order;",
        "DELETE client;",
        "DELETE product;",
        "DELETE bakery;",
    ]), conn, dry_run)


def define_indexes(conn, dry_run):
    """Index every foreign key. The `expr:` roll-up columns on `invoice` and
    `client` are correlated subqueries — `WHERE invoice = $parent.id` and the
    like — so without these each row of a grid full-scans a child table.
    Unindexed, opening the invoices page took eighteen seconds."""
    print("Defining foreign-key indexes …")
    run_sql("\n".join([
        "DEFINE INDEX IF NOT EXISTS order_invoice   ON order   FIELDS invoice;",
        "DEFINE INDEX IF NOT EXISTS order_client    ON order   FIELDS client;",
        "DEFINE INDEX IF NOT EXISTS order_bakery    ON order   FIELDS bakery;",
        "DEFINE INDEX IF NOT EXISTS payment_invoice ON payment FIELDS invoice;",
        "DEFINE INDEX IF NOT EXISTS invoice_client  ON invoice FIELDS client;",
        "DEFINE INDEX IF NOT EXISTS invoice_bakery  ON invoice FIELDS bakery;",
        "DEFINE INDEX IF NOT EXISTS client_bakery   ON client  FIELDS bakery;",
        "DEFINE INDEX IF NOT EXISTS product_bakery  ON product FIELDS bakery;",
    ]), conn, dry_run)


def main():
    ap = argparse.ArgumentParser(
        description="Seed the Breg bakery SurrealDB with a realistic dataset.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("tier", nargs="?", choices=list(TIERS), help="data volume")
    ap.add_argument("--no-clients", action="store_true",
                    help="catalog only: shops + products, no accounts and "
                         "nothing downstream of them (orders, invoices, "
                         "payments) — clients arrive via the magic "
                         "promotion (scripts/promotion.py)")
    ap.add_argument("--with-clients", choices=["true", "false"], default=None,
                    help="explicit form of --no-clients for form-driven "
                         "callers: 'false' skips accounts (and their "
                         "downstream), 'true' seeds everything")
    ap.add_argument("--wipe", action="store_true", help="clear the tables before seeding")
    ap.add_argument("--wipe-only", action="store_true", help="clear the tables and exit")
    ap.add_argument("--seed", type=int, default=None, help="RNG seed for reproducibility")
    ap.add_argument("--dry-run", action="store_true", help="print plan, run no SQL")
    ap.add_argument("--chunk", type=int, default=500, help="rows per INSERT (default 500)")
    ap.add_argument("--endpoint", default=os.environ.get("SURREAL_ENDPOINT", "ws://localhost:8000"))
    ap.add_argument("--user", default=os.environ.get("SURREAL_USER", "root"))
    ap.add_argument("--pass", dest="password", default=os.environ.get("SURREAL_PASS", "root"))
    ap.add_argument("--ns", default=os.environ.get("SURREAL_NS", "bakery"))
    ap.add_argument("--db", default=os.environ.get("SURREAL_DB", "v2"))
    args = ap.parse_args()
    if args.with_clients is not None:
        args.no_clients = args.with_clients == "false"

    conn = dict(endpoint=args.endpoint, user=args.user, password=args.password,
                ns=args.ns, db=args.db)
    if args.seed is not None:
        random.seed(args.seed)

    if args.wipe or args.wipe_only:
        wipe(conn, args.dry_run)
    if args.wipe_only:
        print("Done (cleared).")
        return

    if not args.tier:
        ap.error("a tier (xs|m|xl) is required unless --wipe-only is given")

    cfg = TIERS[args.tier]
    if args.no_clients:
        print(f"Seeding tier '{args.tier}' catalog: {cfg['shops']} shops + products "
              f"(no accounts — sign clients with the magic promotion)"
              + ("  [DRY RUN]" if args.dry_run else ""))
    else:
        print(f"Seeding tier '{args.tier}': {cfg['shops']} shops, {cfg['clients']} accounts, "
              f"{cfg['orders']} orders over {cfg['days']} days"
              + ("  [DRY RUN]" if args.dry_run else ""))

    shop_rows, shops = gen_shops(cfg["shops"])
    product_rows, product_pool = gen_products(shops)

    emit("shops", "bakery", shop_rows, conn, args.dry_run, args.chunk)
    emit("products", "product", product_rows, conn, args.dry_run, args.chunk)

    # Everything below hangs off client records, so --no-clients skips
    # the lot: orders reference accounts, invoices consolidate orders,
    # payments settle invoices.
    if not args.no_clients:
        client_rows, client_pool = gen_clients(cfg["clients"], shops)
        orders, edge_rows = gen_orders(cfg["orders"], cfg["days"], shops,
                                       client_pool, product_pool)
        invoice_rows, payment_rows, attach = gen_billing(orders, cfg["days"])

        emit("accounts", "client", client_rows, conn, args.dry_run, args.chunk)
        emit("orders", "order", [o.sql for o in orders], conn, args.dry_run, args.chunk)
        emit("edges", "placed", edge_rows, conn, args.dry_run, args.chunk, relation=True)
        emit("invoices", "invoice", invoice_rows, conn, args.dry_run, args.chunk)
        emit("payments", "payment", payment_rows, conn, args.dry_run, args.chunk)

        # Attaching orders to their invoice is an UPDATE per order, not an
        # INSERT, so it runs as its own batched statement block.
        total = 0
        for batch in chunked(attach, args.chunk):
            run_sql("\n".join(batch), conn, args.dry_run)
            total += len(batch)
            print(f"  invoiced orders: {total}/{len(attach)}", end="\r", flush=True)
        print(f"  invoiced orders: {len(attach)} done            ")

    # Last, so the bulk inserts above are not paying to maintain them.
    define_indexes(conn, args.dry_run)

    print("Done." if not args.dry_run else "Dry run complete — no SQL executed.")


if __name__ == "__main__":
    main()

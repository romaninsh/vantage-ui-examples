#!/usr/bin/env python3
"""Seed the Hill Valley bakery SurrealDB with bulk demo data.

Generates clients, products, orders (with embedded `lines`) and the
`client -> placed -> order` graph edges, spread over a time window so the
dashboard's charts, debtor list and low-stock list have something to show.

Generated records carry a `gen_` id prefix (e.g. `order:gen_o000123`); the
three hand-authored clients and five products are left untouched and are also
referenced by generated orders so they gain activity too. `--wipe` removes
only the `gen_` records.

Usage:
    python3 seed.py xs            # ~60 orders, 90-day window  (quick smoke)
    python3 seed.py m             # ~2k orders, 1-year window  (default demo)
    python3 seed.py xl            # ~40k orders, 2-year window (stress)
    python3 seed.py m --wipe      # drop previous gen_ data, then reseed
    python3 seed.py --wipe-only   # just drop gen_ data

Connection defaults match the running app (override via flags or env):
    --endpoint ws://localhost:8000  --user root --pass root --ns bakery --db v2

This script MUTATES the database. It is not run automatically — run it
yourself when you want to (re)populate the demo.
"""

import argparse
import os
import random
import subprocess
import sys
from datetime import datetime, timedelta, timezone

BAKERY = "bakery:hill_valley"

# Hand-authored records already in the DB — generated orders reference these
# too, so Biff/Doc/Marty and the five named products keep showing up.
REAL_CLIENTS = ["client:biff", "client:doc", "client:marty"]
REAL_PRODUCTS = [
    ("product:delorean_donut", 135),
    ("product:flux_cupcake", 120),
    ("product:hover_cookies", 199),
    ("product:sea_pie", 299),
    ("product:time_tart", 220),
]

TIERS = {
    "xs": dict(clients=15, products=10, orders=60, days=90),
    "m": dict(clients=150, products=30, orders=2000, days=365),
    "xl": dict(clients=1200, products=60, orders=40000, days=730),
}

STATUSES = [
    "placed", "confirmed", "in_production", "ready",
    "delivered", "picked_up", "paid", "cancelled",
]
STATUS_WEIGHTS = [10, 8, 6, 6, 14, 12, 30, 4]

FIRST = ["Marty", "Doc", "Biff", "Lorraine", "George", "Jennifer", "Clara",
         "Emmett", "Goldie", "Needles", "Dave", "Linda", "Strickland", "Match"]
LAST = ["McFly", "Brown", "Tannen", "Baines", "Clayton", "Parker", "Wilson",
         "Sanchez", "Carruthers", "Stricklund", "Wells", "Danielson"]
ADJ = ["Flux", "Plutonium", "Hoverboard", "DeLorean", "Clocktower", "88mph",
       "Twin Pines", "Lone Pine", "Enchantment", "Mr Fusion", "Almanac",
       "Skyway", "Hill Valley", "Chrono", "Tachyon"]
NOUN = ["Cupcake", "Doughnut", "Tart", "Pie", "Cookie", "Muffin", "Croissant",
        "Eclair", "Scone", "Brownie", "Loaf", "Danish", "Bun", "Roll"]


def dt_literal(d: datetime) -> str:
    return 'd"' + d.strftime("%Y-%m-%dT%H:%M:%SZ") + '"'


def gen_products(n: int):
    """Return (insert_rows, pool) where pool is [(id, price)] incl. real ones."""
    rows, pool = [], list(REAL_PRODUCTS)
    for i in range(n):
        pid = f"product:gen_p{i:04d}"
        name = f"{random.choice(ADJ)} {random.choice(NOUN)} #{i:03d}"
        price = random.randint(80, 450)
        calories = random.randint(120, 520)
        # ~1 in 4 deliberately low so the low-stock list has volume.
        stock = random.randint(0, 9) if random.random() < 0.25 else random.randint(10, 200)
        rows.append(
            f'{{ id: {pid}, name: "{name}", price: {price}, calories: {calories}, '
            f"is_deleted: false, inventory: {{ stock: {stock} }}, bakery: {BAKERY} }}"
        )
        pool.append((pid, price))
    return rows, pool


def gen_clients(n: int):
    rows, pool = [], list(REAL_CLIENTS)
    for i in range(n):
        cid = f"client:gen_c{i:04d}"
        name = f"{random.choice(FIRST)} {random.choice(LAST)}"
        email = f"gen{i:04d}@hillvalley.test"
        paying = random.random() > 0.4
        # ~35% owe money (negative balance) -> debtor list + KPI.
        if random.random() < 0.35:
            balance = f"{-random.uniform(5, 600):.2f}"
        else:
            balance = f"{random.uniform(0, 1200):.2f}"
        credit = random.choice([200, 500, 1000, 2000])
        rows.append(
            f'{{ id: {cid}, name: "{name}", email: "{email}", '
            f'contact_details: "555-{random.randint(1000, 9999)}", '
            f"is_paying_client: {str(paying).lower()}, "
            f'balance: <decimal>"{balance}", bakery: {BAKERY}, '
            f"metadata: {{ credit_limit: {credit}, notes: \"\" }} }}"
        )
        pool.append(cid)
    return rows, pool


def gen_orders(n: int, days: int, clients, products):
    now = datetime.now(timezone.utc)
    orders, edges = [], []
    for i in range(n):
        oid = f"order:gen_o{i:06d}"
        client = random.choice(clients)
        # Bias toward recent so the revenue line trends rather than flatlines.
        frac = random.random() ** 0.6
        created = now - timedelta(seconds=int(frac * days * 86400))
        created -= timedelta(seconds=random.randint(0, 86399))
        status = random.choices(STATUSES, weights=STATUS_WEIGHTS, k=1)[0]
        lines = []
        for _ in range(random.randint(1, 5)):
            pid, price = random.choice(products)
            qty = random.randint(1, 8) if random.random() < 0.9 else random.randint(20, 200)
            lines.append(f"{{ product: {pid}, quantity: {qty}, price: {price} }}")
        orders.append(
            f"{{ id: {oid}, bakery: {BAKERY}, client: {client}, "
            f"created_at: {dt_literal(created)}, is_deleted: false, "
            f'status: "{status}", lines: [ {", ".join(lines)} ] }}'
        )
        edges.append(
            f"{{ in: {client}, out: {oid}, placed_at: {dt_literal(created)} }}"
        )
    return orders, edges


def chunked(rows, size):
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


def run_sql(sql: str, conn, dry_run: bool):
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
    print("Wiping previous gen_ records …")
    stmts = [
        "DELETE placed WHERE string::starts_with(record::id(out), 'gen_');",
        "DELETE order WHERE string::starts_with(record::id(id), 'gen_');",
        "DELETE client WHERE string::starts_with(record::id(id), 'gen_');",
        "DELETE product WHERE string::starts_with(record::id(id), 'gen_');",
    ]
    run_sql("\n".join(stmts), conn, dry_run)


def main():
    ap = argparse.ArgumentParser(
        description="Seed the Hill Valley bakery SurrealDB with bulk demo data.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("tier", nargs="?", choices=list(TIERS), help="data volume")
    ap.add_argument("--wipe", action="store_true", help="drop gen_ data before seeding")
    ap.add_argument("--wipe-only", action="store_true", help="drop gen_ data and exit")
    ap.add_argument("--seed", type=int, default=None, help="RNG seed for reproducibility")
    ap.add_argument("--dry-run", action="store_true", help="print plan, run no SQL")
    ap.add_argument("--chunk", type=int, default=500, help="rows per INSERT (default 500)")
    ap.add_argument("--endpoint", default=os.environ.get("SURREAL_ENDPOINT", "ws://localhost:8000"))
    ap.add_argument("--user", default=os.environ.get("SURREAL_USER", "root"))
    ap.add_argument("--pass", dest="password", default=os.environ.get("SURREAL_PASS", "root"))
    ap.add_argument("--ns", default=os.environ.get("SURREAL_NS", "bakery"))
    ap.add_argument("--db", default=os.environ.get("SURREAL_DB", "v2"))
    args = ap.parse_args()

    conn = dict(endpoint=args.endpoint, user=args.user, password=args.password,
                ns=args.ns, db=args.db)
    if args.seed is not None:
        random.seed(args.seed)

    if args.wipe or args.wipe_only:
        wipe(conn, args.dry_run)
    if args.wipe_only:
        print("Done (wipe only).")
        return

    if not args.tier:
        ap.error("a tier (xs|m|xl) is required unless --wipe-only is given")

    cfg = TIERS[args.tier]
    print(f"Seeding tier '{args.tier}': {cfg['clients']} clients, "
          f"{cfg['products']} products, {cfg['orders']} orders over {cfg['days']} days"
          + ("  [DRY RUN]" if args.dry_run else ""))

    product_rows, product_pool = gen_products(cfg["products"])
    client_rows, client_pool = gen_clients(cfg["clients"])
    order_rows, edge_rows = gen_orders(cfg["orders"], cfg["days"], client_pool, product_pool)

    emit("products", "product", product_rows, conn, args.dry_run, args.chunk)
    emit("clients", "client", client_rows, conn, args.dry_run, args.chunk)
    emit("orders", "order", order_rows, conn, args.dry_run, args.chunk)
    emit("edges", "placed", edge_rows, conn, args.dry_run, args.chunk, relation=True)

    print("Done." if not args.dry_run else "Dry run complete — no SQL executed.")


if __name__ == "__main__":
    main()

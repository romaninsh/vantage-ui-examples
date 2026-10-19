#!/bin/sh
# Make the four databases under data/ from scratch: three bakeries, their
# products, clients and orders, the head-office payroll, and the (empty)
# staff and session tables `session:` needs.
set -eu
cd "$(dirname "$0")"
mkdir -p data
rm -f data/directory.db data/shop.db data/hq.db data/auth.db
sqlite3 data/directory.db <<'SQL'
CREATE TABLE bakery (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL);
INSERT INTO bakery VALUES (1, 'Breg HQ', 'York'), (2, 'Breg Newcastle', 'Newcastle'), (3, 'Breg Leeds', 'Leeds');
SQL
sqlite3 data/shop.db <<'SQL'
CREATE TABLE product (id TEXT PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL,
  bakery_id INTEGER NOT NULL, bakery_name TEXT NOT NULL);
CREATE TABLE client (id TEXT PRIMARY KEY, name TEXT NOT NULL,
  bakery_id INTEGER NOT NULL, bakery_name TEXT NOT NULL);
CREATE TABLE orders (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, product_id TEXT NOT NULL,
  qty INTEGER NOT NULL, bakery_id INTEGER NOT NULL, bakery_name TEXT NOT NULL);
INSERT INTO product VALUES
  ('pr1', 'Sourdough',  450, 1, 'Breg HQ'),
  ('pr2', 'Croissant',  180, 2, 'Breg Newcastle'),
  ('pr3', 'Rye loaf',   400, 3, 'Breg Leeds'),
  ('pr4', 'Iced bun',   150, 3, 'Breg Leeds');
INSERT INTO client VALUES
  ('c1', 'Café Nord',   2, 'Breg Newcastle'),
  ('c2', 'Leeds Deli',  3, 'Breg Leeds'),
  ('c3', 'Kirkgate Co', 3, 'Breg Leeds');
INSERT INTO orders VALUES
  ('o1', 'c1', 'pr2', 40, 2, 'Breg Newcastle'),
  ('o2', 'c2', 'pr3', 12, 3, 'Breg Leeds'),
  ('o3', 'c3', 'pr4', 30, 3, 'Breg Leeds');
SQL
sqlite3 data/hq.db <<'SQL'
CREATE TABLE payroll (id TEXT PRIMARY KEY, employee TEXT NOT NULL, monthly INTEGER NOT NULL,
  office TEXT NOT NULL);
INSERT INTO payroll VALUES ('w1', 'Ada Breg', 4200, 'york'), ('w2', 'Tom Hale', 2900, 'york');
SQL
sqlite3 data/auth.db <<'SQL'
CREATE TABLE staff_member (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
  bakery_id INTEGER);
CREATE TABLE session (id TEXT PRIMARY KEY,
  staff_member_id TEXT REFERENCES staff_member(id) ON DELETE CASCADE,
  name TEXT, role TEXT, bakery_id INTEGER, office TEXT);
SQL
echo "data/: 3 bakeries, 4 products, 3 clients, 3 orders, 2 payroll rows"

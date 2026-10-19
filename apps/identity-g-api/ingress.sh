#!/bin/sh
# Make data/auth.db and data/main.db from scratch: one staff member and two
# customers (password "flags-demo-pw" for each), and three tickets.
set -eu
cd "$(dirname "$0")"
mkdir -p data
rm -f data/auth.db data/main.db
HASH='$argon2id$v=19$m=19456,t=2,p=1$/NZRcRpGl/WAnk0U9DzPQg$ueVIoNXHwUysN/qIX5T2dAyl7y/lf2lW4+OCvDcErbY'
sqlite3 data/auth.db <<SQL
CREATE TABLE person (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL, password_hash TEXT
);
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  name TEXT, role TEXT, app TEXT,
  expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+8 hours'))
);
INSERT INTO person VALUES
  ('p1', 'Sam',  'sam@tickets.test',  'staff',    '$HASH'),
  ('p2', 'Cleo', 'cleo@tickets.test', 'customer', '$HASH'),
  ('p3', 'Carl', 'carl@tickets.test', 'customer', '$HASH');
SQL
sqlite3 data/main.db <<'SQL'
CREATE TABLE ticket (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL
);
INSERT INTO ticket VALUES
  ('t1', 'Invoice is wrong',   'p2', 'open'),
  ('t2', 'Cannot log in',      'p2', 'closed'),
  ('t3', 'Delivery is late',   'p3', 'open');
SQL
echo "data/auth.db: 3 people; data/main.db: 3 tickets"

#!/bin/sh
# Make data/auth.db and data/main.db from scratch: the schema, three
# people (password "flags-demo-pw" for each) and four flags.
set -eu
cd "$(dirname "$0")"
mkdir -p data
rm -f data/auth.db data/main.db
sqlite3 data/auth.db <<'SQL'
CREATE TABLE person (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL, envs TEXT NOT NULL DEFAULT '', password_hash TEXT
);
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  name TEXT, role TEXT, envs TEXT,
  expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+8 hours'))
);
INSERT INTO person VALUES
  ('p1', 'Owen', 'owen@flags.test', 'admin',  'dev,test,prod', '$argon2id$v=19$m=19456,t=2,p=1$/NZRcRpGl/WAnk0U9DzPQg$ueVIoNXHwUysN/qIX5T2dAyl7y/lf2lW4+OCvDcErbY'),
  ('p2', 'Eve',  'eve@flags.test',  'editor', 'dev,test',      '$argon2id$v=19$m=19456,t=2,p=1$/NZRcRpGl/WAnk0U9DzPQg$ueVIoNXHwUysN/qIX5T2dAyl7y/lf2lW4+OCvDcErbY'),
  ('p3', 'Vic',  'vic@flags.test',  'viewer', '',              '$argon2id$v=19$m=19456,t=2,p=1$/NZRcRpGl/WAnk0U9DzPQg$ueVIoNXHwUysN/qIX5T2dAyl7y/lf2lW4+OCvDcErbY');
SQL
sqlite3 data/main.db <<'SQL'
CREATE TABLE feature_flag (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, environment TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0
);
INSERT INTO feature_flag VALUES
  ('f1', 'checkout-v2', 'dev',  1),
  ('f2', 'checkout-v2', 'prod', 0),
  ('f3', 'dark-mode',   'test', 1),
  ('f4', 'new-pricing', 'prod', 0);
SQL
echo "data/auth.db: 3 people; data/main.db: 4 flags"

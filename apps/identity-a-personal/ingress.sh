#!/bin/sh
# Make data/notes.db from scratch: the schema and three notes.
set -eu
cd "$(dirname "$0")"
mkdir -p data
rm -f data/notes.db
sqlite3 data/notes.db <<'SQL'
CREATE TABLE note (id TEXT PRIMARY KEY, text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0);
INSERT INTO note VALUES
  ('n1', 'Renew the passport', 0),
  ('n2', 'Book the dentist', 1),
  ('n3', 'Back up the laptop', 0);
SQL
echo "data/notes.db: 3 notes"

#!/usr/bin/env bash
# Fills the warehouse. Runs once, on the first start of an empty data
# volume, inside the postgres image's init phase: the server is up on
# its unix socket only, so the healthcheck (loopback) stays "starting"
# until this finishes and the real server comes up.
#
#   catalogue (YAML) -> generators -> CSV -> silver -> simulator -> gold marts
#
# Each stage reads what the last one wrote, so the order is the point.
# Progress goes to the container log, which the Services panel follows.
# Expect ten minutes or so on a two-core VM; the simulator and the marts
# take most of it.
set -euo pipefail
cd /warehouse

export PGHOST=/var/run/postgresql
export PGUSER="$POSTGRES_USER" PGDATABASE="$POSTGRES_DB" PGPASSWORD="$POSTGRES_PASSWORD"
SEED="${CASHGPT_SEED:-2026}"
# Every DDL file drops what it recreates; the "does not exist" notices
# are noise on a fresh database.
export PGOPTIONS='-c client_min_messages=warning'
sql() { psql -v ON_ERROR_STOP=1 -q "$@"; }

echo "warehouse: generating silver CSVs"
for s in dates seniority org-units employees platforms models apps behaviour; do
  printf '  %-12s ' "$s"
  node "scripts/silver/$s.mjs" | tail -n 1 | cut -c1-96
done

echo "warehouse: loading silver"
sql -c "CREATE SCHEMA IF NOT EXISTS silver; CREATE SCHEMA IF NOT EXISTS gold;"
# Dependency order, not alphabetical: referenced tables first.
TABLES=(
  dim_date dim_seniority dim_org_unit dim_employee dim_platform dim_model
  dim_app dim_behaviour_profile dim_employee_behaviour fct_usage
)
for t in "${TABLES[@]}"; do
  sql < "schema/silver/$t.sql"
  f="data/silver/$t.csv"
  # The simulator writes the two tables that have no CSV.
  [ -f "$f" ] || continue
  echo "  $t"
  sql -c "\copy silver.$t($(head -1 "$f")) FROM STDIN WITH (FORMAT csv, HEADER true)" < "$f"
done
for f in schema/gold/*.sql; do
  sql < "$f"
done
sql -c "ANALYZE silver.dim_org_unit; ANALYZE silver.dim_employee; ANALYZE silver.dim_seniority;"

# The simulator holds every fact row of its selection in memory until one
# COMMIT: all 500,000 people at once need a 6 GB heap, more than a small
# VM has. One department at a time stays well under 1 GB, and the
# per-employee seed makes the result identical to a single run.
echo "warehouse: simulating usage (seed $SEED)"
for d in $(sql -tA -c "SELECT DISTINCT department_id FROM silver.dim_employee ORDER BY 1"); do
  printf '  %-10s ' "$d"
  node --max-old-space-size=1024 scripts/sim/simulate.mjs --department "$d" --seed "$SEED" \
    | grep -m1 'fact rows'
done

# Every mart reads fct_usage, so they cannot be built earlier. The marts
# aggregate the facts several ways; capped work_mem and no parallel
# workers keep the server inside the VM's memory (a batch job taking
# longer is free, being killed half-way costs the whole fill).
echo "warehouse: building gold marts"
export PGOPTIONS="$PGOPTIONS -c work_mem=32MB -c max_parallel_workers_per_gather=0"
for m in mart_fact_agg mart_employee_month mart_peer_benchmark mart_org_month \
         mart_app_month mart_spend_agg mart_team_month mart_headline \
         mart_lob_channel mart_filter_totals; do
  printf '  %-22s ' "$m"
  start=$(date +%s)
  sql < "schema/marts/$m.sql"
  echo "$(( $(date +%s) - start ))s"
done
echo "warehouse: ready"

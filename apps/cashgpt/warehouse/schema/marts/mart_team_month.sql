-- =============================================================================
-- GRAIN: one row per team-ish org unit per month, levels 4-6. ~290,000 rows.
-- =============================================================================
--
-- The team efficiency panel, and nothing else.
--
-- WHY NOT JUST QUERY mart_org_month. Same rows, but that table is 111MB at 372
-- bytes a row, most of it org_path and the level-2 and level-3 rollups this
-- panel never looks at. Postgres is a row store: the panel paid for every one
-- of those bytes on every scan, and it measured 438ms — the slowest thing on
-- the dashboard by a factor of two.
--
-- Narrow, and levels 4-6 only. Roughly a fifth of the bytes for exactly the
-- same answer.
--
-- Source: gold.mart_org_month.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;
DROP TABLE IF EXISTS gold.mart_team_month CASCADE;

CREATE TABLE gold.mart_team_month AS
SELECT org_id, org_name, org_level, lob_id, lob_name, resource_org,
       work_type, city, headcount, month_key,
       active, spend_usd, top_tier_share
FROM gold.mart_org_month
WHERE org_level BETWEEN 4 AND 6;

ALTER TABLE gold.mart_team_month
    ADD CONSTRAINT pk_mtm PRIMARY KEY (org_id, month_key);
CREATE INDEX ix_mtm_month ON gold.mart_team_month (month_key);
CREATE INDEX ix_mtm_lob   ON gold.mart_team_month (lob_id, month_key);

ANALYZE gold.mart_team_month;

COMMENT ON TABLE gold.mart_team_month IS
    'Levels 4-6 only, narrow. Exists because the wide org mart made the efficiency panel the slowest on the dashboard.';

-- =============================================================================
-- Name search.
--
-- Both pickers match on a substring of a name — "Patel" has to find
-- "Aarav Patel" — and ILIKE '%term%' cannot use a btree index, so it read all
-- 500,000 employees on every keystroke. A trigram index is the one structure
-- that can serve an unanchored match.
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP INDEX IF EXISTS silver.ix_dim_employee_name_trgm;
CREATE INDEX ix_dim_employee_name_trgm
    ON silver.dim_employee USING gin (full_name gin_trgm_ops);

ANALYZE silver.dim_employee;

-- =============================================================================
-- GRAIN: one row per org unit per month, levels 2-6. ~290,000 rows.
-- =============================================================================
--
-- Rollups for the Org explorer, the executive line-of-business table and the
-- team efficiency panel.
--
-- EVERY LEVEL IS MATERIALISED, NOT DERIVED ON READ. A line of business is the
-- sum of everyone below it. Doing that per request means re-reading 1.7M rows
-- for the top level of the Org explorer, every time somebody loads the page.
--
-- FIVE GROUPED PASSES, NOT AN ANCESTRY PREFIX MATCH. The obvious way to write
-- this is to join each unit to every employee whose org_path starts with the
-- unit's — and it does not work. `LIKE u.org_path || '/%'` builds its pattern
-- from the joined row, so no index can serve it and the planner falls back to
-- a nested loop of 40,000 units against 1.7M person-months. That query was
-- cancelled at nine minutes. Every employee already carries an explicit key for
-- each of their five ancestors, so the same result is five ordinary GROUP BYs
-- over the same table, each on an indexable equality.
--
-- use_cases IS PER MONTH, AND DOES NOT SUM ACROSS MONTHS. Distinct counts never
-- do. A multi-month view takes the max, which is a lower bound on the true
-- union and in practice almost exact, because app reach only grows.
--
-- HEADCOUNT AND ACTIVE ARE DIFFERENT NUMBERS AND BOTH ARE HERE. headcount is
-- everyone in the unit; active is everyone who used AI that month. Adoption is
-- the ratio, and the efficiency panel is unreadable without both.
--
-- Source: gold.mart_employee_month + silver.dim_org_unit.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;
DROP TABLE IF EXISTS gold.mart_org_month CASCADE;

-- -----------------------------------------------------------------------------
-- Distinct apps per org unit per month — the "use cases" column.
--
-- BUILT AS SEPARATE STATEMENTS, NOT ONE CTE CHAIN. As a single query the five
-- count(DISTINCT) aggregates are planned together, each gets its own work_mem,
-- and Postgres was killed by the OOM killer part-way through. Splitting them
-- means each hash table is built and released before the next one starts.
--
-- The reduction to (month, employee, app) comes first and matters: 794k rows
-- against 5.4M fact rows, so the five level passes run over the small set.
-- -----------------------------------------------------------------------------
SET work_mem = '32MB';

DROP TABLE IF EXISTS _org_app;
CREATE TEMP TABLE _org_app AS
SELECT ea.month_key, ea.app_id,
       e.lob_id, e.division_id, e.department_id, e.section_id, e.team_org_id
FROM (SELECT DISTINCT month_key, employee_id, app_id FROM silver.fct_usage) ea
JOIN silver.dim_employee e USING (employee_id);

DROP TABLE IF EXISTS _use_cases;
CREATE TEMP TABLE _use_cases (org_id varchar(16), month_key char(7), use_cases int);

INSERT INTO _use_cases SELECT lob_id,        month_key, count(DISTINCT app_id) FROM _org_app GROUP BY 1, 2;
INSERT INTO _use_cases SELECT division_id,   month_key, count(DISTINCT app_id) FROM _org_app WHERE division_id   <> '' GROUP BY 1, 2;
INSERT INTO _use_cases SELECT department_id, month_key, count(DISTINCT app_id) FROM _org_app WHERE department_id <> '' GROUP BY 1, 2;
INSERT INTO _use_cases SELECT section_id,    month_key, count(DISTINCT app_id) FROM _org_app WHERE section_id    <> '' GROUP BY 1, 2;
INSERT INTO _use_cases SELECT team_org_id,   month_key, count(DISTINCT app_id) FROM _org_app GROUP BY 1, 2;

DROP TABLE _org_app;
CREATE INDEX ON _use_cases (org_id, month_key);
ANALYZE _use_cases;

CREATE TABLE gold.mart_org_month AS
WITH
rolled AS (
    -- Level 2 — line of business
    SELECT lob_id AS org_id, month_key,
           count(*)::int AS active, sum(spend_usd) AS spend_usd, sum(tokens) AS tokens,
           sum(spend_usd * top_tier_share) AS top_tier_spend
    FROM gold.mart_employee_month GROUP BY 1, 2
    UNION ALL
    -- Level 3 — division
    SELECT division_id, month_key,
           count(*)::int, sum(spend_usd), sum(tokens), sum(spend_usd * top_tier_share)
    FROM gold.mart_employee_month WHERE division_id <> '' GROUP BY 1, 2
    UNION ALL
    -- Level 4 — department
    SELECT department_id, month_key,
           count(*)::int, sum(spend_usd), sum(tokens), sum(spend_usd * top_tier_share)
    FROM gold.mart_employee_month WHERE department_id <> '' GROUP BY 1, 2
    UNION ALL
    -- Level 5 — section
    SELECT section_id, month_key,
           count(*)::int, sum(spend_usd), sum(tokens), sum(spend_usd * top_tier_share)
    FROM gold.mart_employee_month WHERE section_id <> '' GROUP BY 1, 2
    UNION ALL
    -- Level 6 — team
    SELECT team_org_id, month_key,
           count(*)::int, sum(spend_usd), sum(tokens), sum(spend_usd * top_tier_share)
    FROM gold.mart_employee_month GROUP BY 1, 2
),
units AS (
    SELECT org_id, parent_org_id, org_level, org_name, org_path, team_code,
           lob_id, lob_name, resource_org, work_type, headcount,
           site_code, city, location_region
    FROM silver.dim_org_unit
    WHERE org_level BETWEEN 2 AND 6
),
kids AS (
    SELECT DISTINCT parent_org_id FROM silver.dim_org_unit WHERE parent_org_id IS NOT NULL
)
SELECT
    u.org_id,
    u.parent_org_id,
    u.org_level,
    u.org_name,
    u.org_path,
    u.team_code,
    u.lob_id,
    u.lob_name,
    u.resource_org,
    u.work_type,
    u.site_code,
    u.city,
    u.location_region,
    u.headcount,
    r.month_key,
    r.active,
    r.spend_usd::numeric(18,6) AS spend_usd,
    r.tokens::bigint           AS tokens,
    round(r.spend_usd / NULLIF(r.active, 0), 2)          AS spend_per_active,
    round(r.active::numeric / NULLIF(u.headcount, 0), 4) AS adoption_rate,
    -- Cost-weighted: a big spender's model mix counts for more than a small
    -- one's, and an unweighted average of per-person shares is meaningless.
    round(r.top_tier_spend / NULLIF(r.spend_usd, 0), 4)  AS top_tier_share,
    coalesce(a.use_cases, 0)                             AS use_cases,
    -- Drives the expand affordance without a second query per row.
    (k.parent_org_id IS NOT NULL) AS has_children
FROM rolled r
JOIN units u USING (org_id)
LEFT JOIN _use_cases a ON a.org_id = r.org_id AND a.month_key = r.month_key
LEFT JOIN kids k ON k.parent_org_id = u.org_id;

ALTER TABLE gold.mart_org_month
    ADD CONSTRAINT pk_mom PRIMARY KEY (org_id, month_key);

CREATE INDEX ix_mom_parent ON gold.mart_org_month (parent_org_id, month_key);
CREATE INDEX ix_mom_level  ON gold.mart_org_month (org_level, month_key);
CREATE INDEX ix_mom_lob    ON gold.mart_org_month (lob_id, month_key);
CREATE INDEX ix_mom_spend  ON gold.mart_org_month (month_key, spend_usd DESC);
CREATE INDEX ix_mom_perusr ON gold.mart_org_month (org_level, month_key, spend_per_active DESC);

DROP TABLE _use_cases;
RESET work_mem;

ANALYZE gold.mart_org_month;

COMMENT ON TABLE gold.mart_org_month IS
    'Org rollups, levels 2-6, materialised per month. headcount and active are different numbers and both are here.';

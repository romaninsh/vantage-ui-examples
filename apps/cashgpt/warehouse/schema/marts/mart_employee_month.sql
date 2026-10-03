-- =============================================================================
-- GRAIN: one row per person per month they were active. ~1.7M rows.
-- =============================================================================
--
-- The person-level mart. Watchtower, Manager Console and Individual all start
-- here, and every "active people" count on the dashboard is a count of rows in
-- this table — which is the only place distinct people can be counted without
-- touching the fact.
--
-- ONLY ACTIVE MONTHS EXIST. Somebody who used nothing in March has no March
-- row, not a zero row. "No usage yet" and "spent nothing" are different facts,
-- and a zero would drag every average and every peer baseline toward the floor.
--
-- org_path IS CARRIED, NOT JOINED. "Everyone under this manager" is a prefix
-- match on a materialised ancestry string rather than a recursive CTE, which
-- is what makes the Manager Console a single indexed scan.
--
-- top_platform AND top_model ARE PRECOMPUTED. The Watchtower table shows the
-- dominant platform per person per month; computing it per request is a window
-- function over the fact for every row on screen.
--
-- Source: silver.fct_usage. Rebuilt after every simulation run.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;
DROP TABLE IF EXISTS gold.mart_employee_month CASCADE;

-- -----------------------------------------------------------------------------
-- BUILT AS SEPARATE STATEMENTS, NOT ONE CTE CHAIN.
--
-- Four aggregates over 5.4M fact rows — the per-person totals, the dominant
-- platform, the dominant model and the tier mix — get planned together as CTEs,
-- each allocating its own work_mem, and Postgres was killed by the OOM killer
-- part-way through. Splitting them means one hash table exists at a time.
-- -----------------------------------------------------------------------------
SET work_mem = '32MB';
-- Intra-query parallelism multiplies the memory a single aggregate holds.
-- The marts are a batch job; taking longer is free, being killed is not.
SET max_parallel_workers_per_gather = 0;

DROP TABLE IF EXISTS _per_person;
CREATE TEMP TABLE _per_person AS
SELECT month_key, employee_id,
       sum(tokens)::bigint           AS tokens,
       sum(spend_usd)::numeric(18,6) AS spend_usd,
       count(DISTINCT model_id)::int AS models_used,
       count(DISTINCT app_id)::int   AS apps_used,
       bool_or(is_spike)             AS had_spike
FROM silver.fct_usage
GROUP BY 1, 2;
CREATE INDEX ON _per_person (month_key, employee_id);

-- The dominant route for that person-month. DISTINCT ON is the cheapest way to
-- take one row per group in Postgres.
DROP TABLE IF EXISTS _top_platform;
CREATE TEMP TABLE _top_platform AS
SELECT DISTINCT ON (month_key, employee_id) month_key, employee_id, platform_id
FROM (SELECT month_key, employee_id, platform_id, sum(spend_usd) AS spend_usd
      FROM silver.fct_usage GROUP BY 1, 2, 3) x
ORDER BY month_key, employee_id, spend_usd DESC, platform_id;
CREATE INDEX ON _top_platform (month_key, employee_id);

DROP TABLE IF EXISTS _top_model;
CREATE TEMP TABLE _top_model AS
SELECT DISTINCT ON (month_key, employee_id) month_key, employee_id, model_id
FROM (SELECT month_key, employee_id, model_id, sum(spend_usd) AS spend_usd
      FROM silver.fct_usage GROUP BY 1, 2, 3) x
ORDER BY month_key, employee_id, spend_usd DESC, model_id;
CREATE INDEX ON _top_model (month_key, employee_id);

DROP TABLE IF EXISTS _top_tier;
CREATE TEMP TABLE _top_tier AS
SELECT u.month_key, u.employee_id,
       sum(u.spend_usd) FILTER (WHERE m.model_tier = 'top') / NULLIF(sum(u.spend_usd), 0)
           AS top_tier_share
FROM silver.fct_usage u JOIN silver.dim_model m USING (model_id)
GROUP BY 1, 2;
CREATE INDEX ON _top_tier (month_key, employee_id);

CREATE TABLE gold.mart_employee_month AS
SELECT
    pp.month_key,
    pp.employee_id,
    e.full_name,

    -- ---- denormalised person, so no panel needs a second join --------------
    e.job_function,
    e.seniority_code,
    e.seniority_rank,
    e.work_type,
    e.location_region,
    e.city,
    e.lob_id,
    e.lob_name,
    o.resource_org,
    e.team_org_id,
    e.team_code,
    o.org_name       AS team_name,
    e.section_id,
    e.department_id,
    e.division_id,
    -- Ancestry as a string: "under this manager" is a prefix match.
    o.org_path,

    pp.tokens,
    pp.spend_usd,
    pp.models_used,
    pp.apps_used,
    pp.had_spike,
    tp.platform_id   AS top_platform_id,
    tm.model_id      AS top_model_id,
    round(coalesce(tt.top_tier_share, 0), 4) AS top_tier_share
FROM _per_person pp
JOIN silver.dim_employee e USING (employee_id)
JOIN silver.dim_org_unit o ON o.org_id = e.team_org_id
LEFT JOIN _top_platform tp USING (month_key, employee_id)
LEFT JOIN _top_model    tm USING (month_key, employee_id)
LEFT JOIN _top_tier     tt USING (month_key, employee_id);

ALTER TABLE gold.mart_employee_month
    ADD CONSTRAINT pk_mem PRIMARY KEY (month_key, employee_id);

CREATE INDEX ix_mem_employee ON gold.mart_employee_month (employee_id);
CREATE INDEX ix_mem_team     ON gold.mart_employee_month (team_org_id, month_key);
CREATE INDEX ix_mem_lob      ON gold.mart_employee_month (lob_id, month_key);
CREATE INDEX ix_mem_spend    ON gold.mart_employee_month (month_key, spend_usd DESC);
-- Prefix matching for "everyone under this org unit".
CREATE INDEX ix_mem_path     ON gold.mart_employee_month (org_path text_pattern_ops);

DROP TABLE _per_person, _top_platform, _top_model, _top_tier;
RESET work_mem;
RESET max_parallel_workers_per_gather;

ANALYZE gold.mart_employee_month;

COMMENT ON TABLE gold.mart_employee_month IS
    'One row per active person-month. The only place distinct people are counted. Absent month = not active, never zero.';

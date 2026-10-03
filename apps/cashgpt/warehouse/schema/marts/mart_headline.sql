-- =============================================================================
-- Two very small marts that exist only to keep the KPI tiles off the big ones.
-- =============================================================================
--
-- Tiles are the first thing on every page and they were the slowest thing on
-- two of them, because "how many people were active" and "who was the worst
-- outlier" both read a person-grain mart of half a gigabyte to produce seven
-- numbers. On a two-core database that scan also crowds out every other panel
-- on the page, so the cost is not just the tile.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;

-- -----------------------------------------------------------------------------
-- GRAIN: month x line of business x resource org x function x grade. ~9k rows.
--
-- Active people, pre-counted. This ROLLS UP CORRECTLY, unlike a user count on a
-- spend mart, because a person belongs to exactly one line of business, one
-- resource org, one function and one grade — so summing `users` across any
-- combination of those still counts each person once WITHIN a month.
--
-- It does NOT roll up across months, and must not be used to: somebody active
-- in three months is one person, and "unique people year to date" still has to
-- go to mart_employee_month for a real DISTINCT.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS gold.mart_active_month CASCADE;

CREATE TABLE gold.mart_active_month AS
SELECT month_key, lob_id, lob_name, resource_org, job_function, seniority_code,
       count(*)::int                 AS users,
       sum(spend_usd)::numeric(18,6) AS spend_usd,
       sum(tokens)::bigint           AS tokens
FROM gold.mart_employee_month
GROUP BY 1, 2, 3, 4, 5, 6;

CREATE INDEX ix_mact_month ON gold.mart_active_month (month_key);
ANALYZE gold.mart_active_month;

COMMENT ON TABLE gold.mart_active_month IS
    'Active people per month by org and person attributes. Rolls up within a month, never across months.';

-- -----------------------------------------------------------------------------
-- GRAIN: month x peer group. 21 rows.
--
-- The Watchtower tiles. The worst outlier of the month under each of the three
-- peer definitions, plus the month's totals — precomputed because finding it
-- live means ordering a 1.1M-row mart by a column chosen at request time, which
-- no index can serve.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS gold.mart_watch_month CASCADE;

CREATE TABLE gold.mart_watch_month AS
WITH long AS (
    SELECT month_key, 'team' AS peer_group, full_name, spend_usd,
           team_multiple AS multiple, team_sigma AS sigma
    FROM gold.mart_peer_benchmark
    UNION ALL
    SELECT month_key, 'function', full_name, spend_usd, func_multiple, func_sigma
    FROM gold.mart_peer_benchmark
    UNION ALL
    SELECT month_key, 'grade', full_name, spend_usd, grade_multiple, grade_sigma
    FROM gold.mart_peer_benchmark
),
worst AS (
    SELECT DISTINCT ON (month_key, peer_group)
           month_key, peer_group, full_name, spend_usd, multiple, sigma
    FROM long WHERE sigma IS NOT NULL
    ORDER BY month_key, peer_group, sigma DESC
),
totals AS (
    SELECT month_key, sum(spend_usd) AS spend, sum(users) AS active
    FROM gold.mart_active_month GROUP BY 1
)
SELECT w.month_key, w.peer_group,
       w.full_name AS worst_name,
       w.spend_usd AS worst_spend,
       w.multiple  AS worst_multiple,
       w.sigma     AS worst_sigma,
       t.spend     AS month_spend,
       t.active    AS month_active,
       lag(t.spend)    OVER (PARTITION BY w.peer_group ORDER BY w.month_key) AS prev_spend,
       lag(t.spend, 3) OVER (PARTITION BY w.peer_group ORDER BY w.month_key) AS spend_three_back
FROM worst w JOIN totals t USING (month_key);

ALTER TABLE gold.mart_watch_month
    ADD CONSTRAINT pk_mwm PRIMARY KEY (month_key, peer_group);

ANALYZE gold.mart_watch_month;

COMMENT ON TABLE gold.mart_watch_month IS
    'Watchtower tiles: worst outlier and month totals, per peer definition. 21 rows.';

-- =============================================================================
-- GRAIN: org unit (levels 2-3) x channel x month. ~2,000 rows.
-- =============================================================================
--
-- The executive "Consolidated spend by line of business" table: lines of
-- business and their divisions, split across the four channels the executives
-- ask about — Claude Code, GitHub Copilot, the LLM suite, and everything else.
--
-- CHANNELS ARE DISJOINT BY PRECEDENCE. A Claude Code session and a Copilot
-- call can both be "coding", so classification is ordered — the app first,
-- then the route, then the kind, then the remainder — and every fact row lands
-- in exactly one channel. Anything else and the four columns stop summing to
-- the total, which is the first thing a finance reader checks.
--
-- USERS ARE COUNTED AT THIS GRAIN, per cell, so "how many people use Copilot
-- in Commercial Banking" is a stored number rather than a sum of person-months
-- that would count January's user twice by March.
--
-- Source: silver.fct_usage. Rebuilt after every simulation run.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;
DROP TABLE IF EXISTS gold.mart_lob_channel CASCADE;

SET work_mem = '32MB';
SET max_parallel_workers_per_gather = 0;

-- One classified pass over the fact, reused by both level rollups.
DROP TABLE IF EXISTS _chan;
CREATE TEMP TABLE _chan AS
SELECT u.month_key, u.employee_id, e.lob_id, e.division_id,
       CASE
         WHEN a.app_name = 'Claude Code'            THEN 'claude_code'
         WHEN u.platform_id = 'github-copilot'      THEN 'copilot'
         WHEN a.kind IN ('assistant', 'analysis', 'research') THEN 'llm_suite'
         ELSE 'others'
       END AS channel,
       u.spend_usd, u.tokens
FROM silver.fct_usage u
JOIN silver.dim_employee e USING (employee_id)
JOIN silver.dim_app      a USING (app_id);

CREATE TABLE gold.mart_lob_channel AS
SELECT lob_id AS org_id, 2 AS org_level, month_key, channel,
       sum(spend_usd)::numeric(18,6)        AS spend_usd,
       count(DISTINCT employee_id)::int     AS users
FROM _chan GROUP BY 1, 3, 4
UNION ALL
SELECT division_id, 3, month_key, channel,
       sum(spend_usd)::numeric(18,6),
       count(DISTINCT employee_id)::int
FROM _chan WHERE division_id <> '' GROUP BY 1, 3, 4;

DROP TABLE _chan;

ALTER TABLE gold.mart_lob_channel
    ADD CONSTRAINT pk_mlc PRIMARY KEY (org_id, month_key, channel);
CREATE INDEX ix_mlc_level ON gold.mart_lob_channel (org_level);

RESET work_mem;
RESET max_parallel_workers_per_gather;

ANALYZE gold.mart_lob_channel;

COMMENT ON TABLE gold.mart_lob_channel IS
    'LOB and division spend by channel. Channels are disjoint by precedence so the columns sum to the total.';

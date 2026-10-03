-- =============================================================================
-- GRAIN: month x line of business x resource org x route x model x suite.
--        ~18,500 rows.
-- =============================================================================
--
-- The hot path. Almost every panel on the Overview and the Executive Brief
-- groups by one of these axes, and none of them group by a person attribute.
--
-- WHY A SECOND, COARSER MART. mart_fact_agg carries job_function, seniority and
-- app_id as well, and those three multiply it to 532,000 rows — 29x this. A
-- panel showing spend by platform paid that 29x for columns it never
-- referenced. Postgres is a row store, so it reads the whole row regardless of
-- the SELECT list; the only way not to pay for a column is not to have it.
--
-- THIS MATTERS BECAUSE CPU IS THE SCARCE RESOURCE, NOT DISK. The database has
-- two cores. A dozen panels firing at once do not fan out across them, they
-- queue — measured at 8 concurrent scans taking 310ms against 327ms run one
-- after another. Nothing about that is fixed by more concurrency or a bigger
-- cache; it is fixed by there being less work to do. 18,500 rows is roughly a
-- millisecond of work.
--
-- THE FULL MART IS STILL THE FALLBACK. A request that filters on job function
-- while grouping by model needs both axes at once, and only mart_fact_agg has
-- them. The server routes to the smallest mart that carries the whole request
-- and falls back when it cannot — see server/panels/source.mjs.
--
-- Source: gold.mart_fact_agg.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;
DROP TABLE IF EXISTS gold.mart_spend_agg CASCADE;

CREATE TABLE gold.mart_spend_agg AS
SELECT month_key, lob_id, lob_name, resource_org,
       platform_id, platform_name, model_id, model_name, provider_group, model_tier,
       kind, usage_driver,
       sum(tokens)::bigint            AS tokens,
       sum(spend_usd)::numeric(18,6)  AS spend_usd
FROM gold.mart_fact_agg
GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12;

CREATE INDEX ix_msa_month ON gold.mart_spend_agg (month_key);
CREATE INDEX ix_msa_lob   ON gold.mart_spend_agg (lob_id, month_key);
ANALYZE gold.mart_spend_agg;

COMMENT ON TABLE gold.mart_spend_agg IS
    'Coarse spend cube — no person attributes, no app. 29x smaller than mart_fact_agg and serves most panels.';

-- =============================================================================
-- GRAIN: month x org x person attributes x suite x tier. ~70,000 rows.
-- =============================================================================
-- The mirror image: carries who the person is, drops which model and route.
-- Serves the "spend by function" and "spend by title" breakdowns.
-- =============================================================================
DROP TABLE IF EXISTS gold.mart_people_agg CASCADE;

CREATE TABLE gold.mart_people_agg AS
SELECT month_key, lob_id, lob_name, resource_org,
       job_function, seniority_code, kind, usage_driver, model_tier,
       sum(tokens)::bigint           AS tokens,
       sum(spend_usd)::numeric(18,6) AS spend_usd
FROM gold.mart_fact_agg
GROUP BY 1,2,3,4,5,6,7,8,9;

CREATE INDEX ix_mpa_month ON gold.mart_people_agg (month_key);
CREATE INDEX ix_mpa_lob   ON gold.mart_people_agg (lob_id, month_key);
ANALYZE gold.mart_people_agg;

COMMENT ON TABLE gold.mart_people_agg IS
    'Spend by who the person is. Carries function and grade; drops model and route.';

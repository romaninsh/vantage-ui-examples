-- =============================================================================
-- GRAIN: month x every dimension the dashboard can filter or group by,
--        with the employee dropped. ~533,000 rows.
-- =============================================================================
--
-- The workhorse. Every spend or token number on every page that is not about a
-- named person comes from here.
--
-- WHY ONE WIDE MART AND NOT SEVEN NARROW ONES. A per-dimension summary is
-- smaller and faster, and it cannot answer "spend by model, for Consumer
-- Banking only" — the LOB is not in it. The moment a filter and a breakdown
-- live on different axes, a narrow mart has to fall back to the fact table, and
-- the dashboard's whole point is that any filter combines with any panel.
--
-- WHY THIS IS SMALL ENOUGH. Dropping employee_id collapses 5.4M fact rows to
-- 533k: 250,000 people resolve to 13 lines of business, 20 job functions and 8
-- grades, so nearly all the fact table's cardinality is the person, and the
-- person is exactly what these panels do not show.
--
-- USER COUNTS DO NOT ROLL UP AND ARE NOT HERE. count(DISTINCT employee) cannot
-- be summed across rows, so a `users` column at this grain would be silently
-- wrong the moment anything grouped it further. Every panel that needs people
-- reads a mart whose grain already matches the question — mart_org_month,
-- mart_app_month or mart_employee_month.
--
-- NO LOCATION. Region and city are on dim_employee and nothing on the dashboard
-- groups by them yet. Carrying region here multiplied the mart by 2.2x — from
-- 533k rows to 1.18M — and doubled the scan time of every panel, to serve no
-- panel. Add it back the day a location filter ships, not before.
--
-- Source: silver.fct_usage. Rebuilt after every simulation run.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;
DROP TABLE IF EXISTS gold.mart_fact_agg CASCADE;

CREATE TABLE gold.mart_fact_agg AS
SELECT
    u.month_key,

    -- ---- who spent it (from the person, not the app) ------------------------
    e.lob_id,
    e.lob_name,
    o.resource_org,
    e.job_function,
    e.seniority_code,

    -- ---- what they spent it on ---------------------------------------------
    u.app_id,
    a.app_name,
    a.kind,
    a.usage_driver,

    -- ---- how it was billed --------------------------------------------------
    u.platform_id,
    p.platform_name,
    u.model_id,
    m.model_name,
    m.provider_group,
    m.family,
    m.model_tier,

    sum(u.tokens)::bigint          AS tokens,
    sum(u.spend_usd)::numeric(18,6) AS spend_usd,
    sum(u.list_spend_usd)::numeric(18,6) AS list_spend_usd,
    count(*)::int                  AS fact_rows
FROM silver.fct_usage u
JOIN silver.dim_employee e USING (employee_id)
JOIN silver.dim_org_unit o ON o.org_id = e.team_org_id
JOIN silver.dim_app      a USING (app_id)
JOIN silver.dim_model    m USING (model_id)
JOIN silver.dim_platform p USING (platform_id)
GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17;

-- Month leads every index because every panel is scoped by period, and the
-- filter bar's month checkboxes are the one filter that is almost never empty.
CREATE INDEX ix_mfa_month     ON gold.mart_fact_agg (month_key);
CREATE INDEX ix_mfa_lob       ON gold.mart_fact_agg (lob_id, month_key);
CREATE INDEX ix_mfa_platform  ON gold.mart_fact_agg (platform_id, month_key);
CREATE INDEX ix_mfa_model     ON gold.mart_fact_agg (model_id, month_key);
CREATE INDEX ix_mfa_driver    ON gold.mart_fact_agg (usage_driver, month_key);
CREATE INDEX ix_mfa_function  ON gold.mart_fact_agg (job_function, month_key);
CREATE INDEX ix_mfa_resource  ON gold.mart_fact_agg (resource_org, month_key);
CREATE INDEX ix_mfa_app       ON gold.mart_fact_agg (app_id, month_key);
CREATE INDEX ix_mfa_tier      ON gold.mart_fact_agg (model_tier, month_key);

ANALYZE gold.mart_fact_agg;

COMMENT ON TABLE gold.mart_fact_agg IS
    'Every filterable dimension, employee dropped. Serves all non-person panels. No user counts — they do not roll up.';

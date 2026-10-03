-- =============================================================================
-- GRAIN: one row per (dimension, member). ~130 rows.
-- =============================================================================
--
-- The filter bar. Every dropdown shows its members with an org-wide total
-- beside each — the dictated "org-wide total spend per resource org" label.
--
-- DELIBERATELY UNFILTERED. The number beside "Consumer Banking" is what that
-- line of business is worth across the whole bank, not what it is worth inside
-- whatever else is currently ticked. A self-filtering filter bar shows every
-- unselected option as zero the moment anything is selected, which is useless
-- and is why this mart takes no parameters at all.
--
-- LONG, NOT WIDE. One row per (dimension, member) rather than a column per
-- dimension: a new filter adds rows instead of changing the schema, and the
-- entire filter bar is one query instead of seven.
--
-- Source: gold.mart_fact_agg + gold.mart_employee_month.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;
DROP TABLE IF EXISTS gold.mart_filter_totals CASCADE;

CREATE TABLE gold.mart_filter_totals AS
WITH d AS (
    SELECT 'month'       AS dimension, month_key     AS member_key, month_key       AS member_label, spend_usd, tokens FROM gold.mart_fact_agg
    UNION ALL SELECT 'lob',           lob_id,        lob_name,        spend_usd, tokens FROM gold.mart_fact_agg
    UNION ALL SELECT 'resource_org',  resource_org,  resource_org,    spend_usd, tokens FROM gold.mart_fact_agg
    UNION ALL SELECT 'usage_driver',  usage_driver,  initcap(usage_driver), spend_usd, tokens FROM gold.mart_fact_agg
    UNION ALL SELECT 'platform',      platform_id,   platform_name,   spend_usd, tokens FROM gold.mart_fact_agg
    UNION ALL SELECT 'model',         model_id,      model_name,      spend_usd, tokens FROM gold.mart_fact_agg
    UNION ALL SELECT 'job_function',  job_function,  job_function,    spend_usd, tokens FROM gold.mart_fact_agg
    UNION ALL SELECT 'tier',          model_tier,    model_tier,      spend_usd, tokens FROM gold.mart_fact_agg
    UNION ALL SELECT 'kind',          kind,          initcap(kind),   spend_usd, tokens FROM gold.mart_fact_agg
    UNION ALL SELECT 'provider_group', provider_group, provider_group, spend_usd, tokens FROM gold.mart_fact_agg
    UNION ALL SELECT 'seniority',     seniority_code, seniority_code, spend_usd, tokens FROM gold.mart_fact_agg
)
SELECT dimension, member_key, member_label,
       sum(spend_usd)::numeric(18,6) AS spend_usd,
       sum(tokens)::bigint           AS tokens
FROM d GROUP BY 1, 2, 3;

ALTER TABLE gold.mart_filter_totals
    ADD CONSTRAINT pk_mft PRIMARY KEY (dimension, member_key);

ANALYZE gold.mart_filter_totals;

COMMENT ON TABLE gold.mart_filter_totals IS
    'Filter bar labels. Unfiltered on purpose — a self-filtering filter bar zeroes every unselected option.';

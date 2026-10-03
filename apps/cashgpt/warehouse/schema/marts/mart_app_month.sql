-- =============================================================================
-- GRAIN: one row per app per month per consuming line of business. ~700 rows.
-- =============================================================================
--
-- The Use Cases & Apps page. Tiny, because the interesting cardinality is 15
-- apps against 13 lines of business, not 250,000 people.
--
-- CONSUMING LOB, NOT OWNING LOB. This is the axis the whole page exists for.
-- Ask Northcrest is built by one department in Enterprise Technology and used
-- by the entire bank; Virtual Agent costs more than its owning line of business
-- spends in total, because a customer-facing app necessarily exports its
-- consumption. Grouping an app's spend by who built it makes every platform
-- team look like the biggest spender in the bank, and it is the mistake this
-- grain is shaped to prevent.
--
-- The owner is still carried, denormalised, so the page can show both — but
-- they come from different columns and can never be confused for one another.
--
-- Source: silver.fct_usage. Rebuilt after every simulation run.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;
DROP TABLE IF EXISTS gold.mart_app_month CASCADE;

CREATE TABLE gold.mart_app_month AS
SELECT
    u.month_key,
    u.app_id,
    a.app_name,
    a.kind,
    a.usage_driver,
    a.status,
    a.audience,
    a.primary_unit,
    a.launched_month,

    -- who built it
    a.owner_lob_id,
    a.owner_lob_name,
    a.owner_department,

    -- who is actually using it — a different question, and the point of this mart
    e.lob_id       AS consumer_lob_id,
    e.lob_name     AS consumer_lob_name,

    count(DISTINCT u.employee_id)::int    AS users,
    count(DISTINCT e.team_org_id)::int    AS teams,
    sum(u.tokens)::bigint                 AS tokens,
    sum(u.spend_usd)::numeric(18,6)       AS spend_usd,
    -- Rollout state is per consumer: the same app is live in one org and still
    -- piloting in another, so it is aggregated here rather than read off dim_app.
    mode() WITHIN GROUP (ORDER BY u.rollout_status) AS rollout_status
FROM silver.fct_usage u
JOIN silver.dim_app a USING (app_id)
JOIN silver.dim_employee e USING (employee_id)
GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13,14;

ALTER TABLE gold.mart_app_month
    ADD CONSTRAINT pk_mam PRIMARY KEY (month_key, app_id, consumer_lob_id);

CREATE INDEX ix_mam_app      ON gold.mart_app_month (app_id, month_key);
CREATE INDEX ix_mam_consumer ON gold.mart_app_month (consumer_lob_id, month_key);
CREATE INDEX ix_mam_owner    ON gold.mart_app_month (owner_lob_id, month_key);

ANALYZE gold.mart_app_month;

COMMENT ON TABLE gold.mart_app_month IS
    'App x month x CONSUMING line of business. Owner is carried separately and is never the grouping key.';

-- =============================================================================
-- Provider mix per app. Separate because its grain is the model, not the
-- consumer, and crossing the two would multiply 15 apps by 13 LOBs by 60
-- models for two panels that never need the combination.
-- =============================================================================
DROP TABLE IF EXISTS gold.mart_app_model_month CASCADE;

CREATE TABLE gold.mart_app_model_month AS
SELECT
    u.month_key,
    u.app_id,
    m.provider_group,
    m.model_id,
    m.model_name,
    m.model_tier,
    u.platform_id,
    sum(u.tokens)::bigint           AS tokens,
    sum(u.spend_usd)::numeric(18,6) AS spend_usd
FROM silver.fct_usage u
JOIN silver.dim_model m USING (model_id)
GROUP BY 1,2,3,4,5,6,7;

CREATE INDEX ix_famm_app ON gold.mart_app_model_month (app_id, month_key);

ANALYZE gold.mart_app_model_month;

COMMENT ON TABLE gold.mart_app_model_month IS
    'Model and route mix per app. Kept apart from the consumer grain on purpose.';

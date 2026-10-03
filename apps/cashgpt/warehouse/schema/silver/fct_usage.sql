-- =============================================================================
-- GRAIN: one row per employee, per model, per app, per month. ~4M rows.
-- =============================================================================
--
-- The only fact that matters. Every figure on every dashboard — org rollups,
-- provider mix, tier share, peer outliers, one person's model switch — is a
-- GROUP BY over this table. Nothing else measures spend.
--
-- WHY MONTH AND NOT DAY. Day grain is 45.5M rows and 2.8GB of CSV for a
-- dimension nothing displays. The cost is that usage can no longer collapse on
-- Good Friday, which is invisible at month grain and the first thing you would
-- want back if a daily view ever appears.
--
-- TOKENS ARE THE TRUTH, SPEND IS DERIVED. spend_usd is tokens x the model's
-- negotiated rate, computed at write time. Both are stored: the derivation is
-- cheap but re-deriving it in every query is not, and a test asserts they still
-- agree. list_spend_usd is the same tokens at published rates — the difference
-- is what procurement negotiated, and it costs one column.
--
-- NO DENORMALISED ORG COLUMNS. Nobody moves team in this model, so
-- dim_employee is a current-state broadcast join and stamping org, grade and
-- line of business onto 4M rows would buy nothing. The moment people start
-- moving, that stamping is the fix — not a versioned dimension.
--
-- PLATFORM IS ON THE FACT, NOT DERIVED FROM THE MODEL. Which route a call took
-- is a property of the call. Claude through Bedrock and Claude direct are the
-- same model on two invoices, and no attribute of dim_model can tell them
-- apart — so the platform breakdown is only answerable if it is measured here.
--
-- rollout_status IS PER CONSUMER. dim_app carries the product's own lifecycle;
-- this carries how far the rollout got in THIS person's org, because the same
-- app is live in one team and still piloting in another.
--
-- Source: scripts/sim/simulate.mjs
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS silver;
DROP TABLE IF EXISTS silver.fct_usage CASCADE;

CREATE TABLE silver.fct_usage (
    -- ---- keys ---------------------------------------------------------------
    month_key        char(7)       NOT NULL,
    employee_id      varchar(12)   NOT NULL,
    model_id         varchar(40)   NOT NULL,
    app_id           varchar(12)   NOT NULL,
    -- HOW the model was reached, which is not who built it. The same model on
    -- two routes is two invoices, so this cannot be derived from model_id.
    platform_id      varchar(24)   NOT NULL,

    -- ---- measures -----------------------------------------------------------
    tokens           bigint        NOT NULL,
    -- decimal, never double: this is summed over 4M rows and floating-point
    -- addition is not associative, so a parallel engine would not give the
    -- same total twice
    spend_usd        numeric(18,6) NOT NULL,
    list_spend_usd   numeric(18,6) NOT NULL,

    -- ---- context ------------------------------------------------------------
    rollout_status   varchar(16)   NOT NULL,   -- development | pilot | production
    -- Marks the months a runaway actually ran away, so an outlier can be
    -- explained without re-running the simulation.
    is_spike         boolean       NOT NULL,

    CONSTRAINT pk_fct_usage PRIMARY KEY (month_key, employee_id, model_id, app_id, platform_id),

    CONSTRAINT fk_fct_usage_employee FOREIGN KEY (employee_id)
        REFERENCES silver.dim_employee (employee_id),
    CONSTRAINT fk_fct_usage_platform FOREIGN KEY (platform_id)
        REFERENCES silver.dim_platform (platform_id),
    CONSTRAINT fk_fct_usage_model FOREIGN KEY (model_id)
        REFERENCES silver.dim_model (model_id),
    CONSTRAINT fk_fct_usage_app FOREIGN KEY (app_id)
        REFERENCES silver.dim_app (app_id),

    CONSTRAINT ck_fct_usage_tokens CHECK (tokens > 0),
    CONSTRAINT ck_fct_usage_spend  CHECK (spend_usd > 0 AND list_spend_usd >= spend_usd),
    CONSTRAINT ck_fct_usage_status CHECK (rollout_status IN ('development', 'pilot', 'production'))
);

-- Rolling up by org means joining 4M rows to dim_employee, so employee_id
-- leads. The month index carries every trend query.
CREATE INDEX ix_fct_usage_employee ON silver.fct_usage (employee_id, month_key);
CREATE INDEX ix_fct_usage_month    ON silver.fct_usage (month_key);
CREATE INDEX ix_fct_usage_model    ON silver.fct_usage (model_id, month_key);
CREATE INDEX ix_fct_usage_app      ON silver.fct_usage (app_id, month_key);

COMMENT ON TABLE silver.fct_usage IS
    'One row per employee, model, app, month. The only table that measures spend.';
COMMENT ON COLUMN silver.fct_usage.spend_usd IS
    'tokens * negotiated rate / 1e6, computed at write time.';
COMMENT ON COLUMN silver.fct_usage.list_spend_usd IS
    'Same tokens at published rates. The gap is the negotiated saving.';
COMMENT ON COLUMN silver.fct_usage.rollout_status IS
    'How far the rollout got in THIS consumer org. Not the app lifecycle.';

-- =============================================================================
-- Iceberg / Trino equivalent
-- =============================================================================
-- The one table where partitioning matters. Month is the universal predicate;
-- sorting by employee clusters the org rollups onto adjacent files.
--
--   CREATE TABLE silver.fct_usage ( ... )
--   WITH (
--     format = 'PARQUET',
--     format_version = 2,
--     partitioning = ARRAY['month_key'],
--     sorted_by = ARRAY['employee_id','model_id']
--   );
-- =============================================================================

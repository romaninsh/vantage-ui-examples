-- =============================================================================
-- GRAIN: one row per model. 60 rows.
-- =============================================================================
--
-- The provider -> family -> model ladder. Usage is classified at the model and
-- every level above it is a rollup, so nothing about the hierarchy is stored
-- twice.
--
-- THREE NAMES BECAUSE THERE ARE THREE QUESTIONS. `provider` is who you pay,
-- `vendor` is who built it, `family` is the product line. They collapse for
-- most models and diverge for exactly the ones that matter — Copilot is built
-- by Microsoft and billed by GitHub, and a contract negotiation and an
-- architecture review want different answers.
--
-- THE RATE LIVES HERE, NOT IN A dim_rate. Prices in this model never change, so
-- a rate is an attribute of the model rather than a slowly-changing fact. A
-- dim_rate keyed by effective period would hold exactly one row per model
-- forever and buy a join. If prices ever do move, that table is the right
-- answer and this column is the thing to remove.
--
-- LIST AND NEGOTIATED, NOT ONE OR THE OTHER. A bank putting 500,000 seats and
-- committed-use volume on the table does not pay rack rate; the counterparties
-- carrying most of the bill concede the most, seat-licensed products little,
-- and the long tail nothing. Discount is per counterparty because that is who
-- you negotiate with — not per model.
--
-- ONE RATE PAIR, NOT AN INPUT/OUTPUT PAIR. Output genuinely costs 3-5x input and
-- real metering separates them — but nothing on any dashboard shows the split,
-- so it would be two columns nobody reads. Blended, at the ~80/20 mix these
-- workloads run.
--
-- decimal, never double: spend is tokens x rate summed over ~38M rows, and
-- floating-point addition is not associative. Trino parallelises aggregation,
-- so a double would not even give the same total twice.
--
-- LIFECYCLE IS WHY THIS TABLE IS NOT JUST A LOOKUP. released_month and
-- retired_month are what let "this tier faded out over the spring" be derived
-- from the facts instead of asserted by a hardcoded array. Months are
-- inclusive: retired 2026-04 means April was the last month with usage.
--
-- Source: schema/catalog/models.yaml via scripts/silver/models.mjs
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS silver;

DROP TABLE IF EXISTS silver.dim_model CASCADE;

CREATE TABLE silver.dim_model (
    model_id            varchar(40)  NOT NULL,
    model_name          varchar(60)  NOT NULL,

    -- ---- the ladder ---------------------------------------------------------
    provider            varchar(40)  NOT NULL,   -- who you pay
    -- Six-bucket reporting rollup: Anthropic, OpenAI, GitHub, Amazon, Meta,
    -- Other. A presentation concern on a silver row, which is a compromise —
    -- the alternative is a dim_provider table for a mapping that never changes.
    -- Promote it if providers ever need contract terms or billing entities.
    provider_group      varchar(24)  NOT NULL,
    vendor              varchar(40)  NOT NULL,   -- who built it
    family              varchar(40)  NOT NULL,   -- the product line

    -- ---- classification -----------------------------------------------------
    model_tier          varchar(12)  NOT NULL,   -- top | high | base | untiered
    tier_name           varchar(24)  NOT NULL,
    modality            varchar(16)  NOT NULL,
    is_reasoning        boolean      NOT NULL,
    -- 0 where it does not apply, as for speech and image
    context_window      integer      NOT NULL,

    -- ---- price --------------------------------------------------------------
    -- Blended USD per 1,000,000 tokens. USD throughout: the bank reports in
    -- sterling, every one of these vendors bills in dollars.
    --
    -- Both rates are kept. Spend is always computed at the negotiated rate;
    -- list is what makes the saving derivable — (list - negotiated) * tokens is
    -- the one number a procurement team actually wants, and it costs a column.
    list_rate_per_1m    numeric(10,4) NOT NULL,   -- published
    rate_per_1m         numeric(10,4) NOT NULL,   -- what we pay

    -- ---- lifecycle ----------------------------------------------------------
    released_month      char(7)      NOT NULL,
    retired_month       char(7),                 -- NULL means still live
    is_active           boolean      NOT NULL,

    source_file         varchar(64)  NOT NULL,
    loaded_at           timestamp(6) NOT NULL DEFAULT now(),

    CONSTRAINT pk_dim_model PRIMARY KEY (model_id),
    CONSTRAINT uq_dim_model_name UNIQUE (model_name),

    CONSTRAINT ck_dim_model_tier CHECK (model_tier IN ('top', 'high', 'base', 'untiered')),
    CONSTRAINT ck_dim_model_ctx  CHECK (context_window >= 0),
    CONSTRAINT ck_dim_model_rate CHECK (rate_per_1m > 0),
    -- you never pay more than list, and a 100% discount is not a discount
    CONSTRAINT ck_dim_model_list CHECK (list_rate_per_1m >= rate_per_1m),
    -- a model cannot retire before it launched
    CONSTRAINT ck_dim_model_life CHECK (retired_month IS NULL OR retired_month >= released_month),
    CONSTRAINT ck_dim_model_active CHECK (is_active = (retired_month IS NULL)),
    -- only untiered models sit outside the reasoning ladder
    CONSTRAINT ck_dim_model_reasoning CHECK (NOT (is_reasoning AND model_tier = 'untiered'))
);

CREATE INDEX ix_dim_model_provider ON silver.dim_model (provider_group, provider);
CREATE INDEX ix_dim_model_tier     ON silver.dim_model (model_tier);
CREATE INDEX ix_dim_model_family   ON silver.dim_model (family);
CREATE INDEX ix_dim_model_active   ON silver.dim_model (is_active);

COMMENT ON TABLE  silver.dim_model IS
    'One row per model. Identity, lifecycle and blended price.';
COMMENT ON COLUMN silver.dim_model.provider IS
    'Who you pay. Diverges from vendor: Copilot is Microsoft-built, GitHub-billed.';
COMMENT ON COLUMN silver.dim_model.provider_group IS
    'Six-bucket reporting rollup. Presentation concern, kept here to avoid a table.';
COMMENT ON COLUMN silver.dim_model.rate_per_1m IS
    'Negotiated blended USD per 1M tokens. spend = tokens * rate / 1e6.';
COMMENT ON COLUMN silver.dim_model.list_rate_per_1m IS
    'Published rate. (list - negotiated) * tokens is the procurement saving.';
COMMENT ON COLUMN silver.dim_model.retired_month IS
    'Inclusive last month of usage. NULL means live at period end.';

-- =============================================================================
-- Iceberg / Trino equivalent
-- =============================================================================
-- ~57 rows, broadcast into every query. Unpartitioned.
--
--   CREATE TABLE silver.dim_model ( ... )
--   WITH (format = 'PARQUET', format_version = 2);
-- =============================================================================

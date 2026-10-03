-- =============================================================================
-- GRAIN: one row per serving platform. 6 rows.
-- =============================================================================
--
-- The axis the invoice arrives on. Six vendor bills land every month, and this
-- is what each one is. dim_model already answers "who built this" — it cannot
-- answer "who charges us for it", because the same model reached three ways
-- produces three different invoices.
--
-- PLATFORM IS NOT PROVIDER. Claude Sonnet called through Bedrock is a line on
-- the AWS bill; the same model called directly is a line on another. Rolling
-- spend up by vendor and calling it the platform breakdown was the defect this
-- table exists to fix: it made four of the six dictated platform totals
-- unreachable and put every Claude dollar on one row.
--
-- live_from_month IS THE JUNE STEP. The Bedrock gateway went live across
-- engineering in June and the monthly bill went from $9.71m to $24.96m. That is
-- not 157% more people — it is frontier models becoming reachable at volume
-- from inside the estate. Before June there is no Bedrock row in fct_usage at
-- all, and Amazon's own models cannot be called by anyone, because Bedrock is
-- the only way to reach them. See data/reference/company-story.md.
--
-- NO BRIDGE TABLE. Which platforms COULD serve a model is derivable from
-- `serves` in the YAML and no dashboard asks it. Only the route actually taken
-- is stored, on fct_usage, where it is a measurement rather than a possibility.
--
-- Source: schema/catalog/models.yaml via scripts/silver/platforms.mjs
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS silver;
DROP TABLE IF EXISTS silver.dim_platform CASCADE;

CREATE TABLE silver.dim_platform (
    platform_id       varchar(24)  NOT NULL,
    platform_name     varchar(40)  NOT NULL,

    -- Who sends the invoice. Not who built the model.
    billed_by         varchar(40)  NOT NULL,

    -- First month this route exists. Facts before it are impossible, and a
    -- test asserts none were written.
    live_from_month   char(7)      NOT NULL,

    note              varchar(400) NOT NULL,

    -- Denormalised so the routing is readable in a SQL client without going
    -- back to the YAML. Pipe-separated; nothing joins on it.
    serves_providers  varchar(400) NOT NULL,
    serves_count      smallint     NOT NULL,

    -- Relative pull when more than one route can serve a model. Seat-licensed
    -- products score high because a paid seat gets used; the gateways score
    -- high because they are the default path once open.
    routing_weight    numeric(5,2) NOT NULL,

    -- Internal reach, Jan..Jul, pipe-separated. Not vendor availability —
    -- the share of the bank that could actually route through it that month,
    -- after procurement, security review and the gateway integration. This is
    -- why January is a small month: most of the bank could not reach most of
    -- the catalogue, not because January's users were light.
    availability      varchar(80)  NOT NULL,
    -- Disciplines that get it first, or 'everyone'. A gateway reaches the
    -- engineers who asked for it before it becomes a general entitlement.
    first_wave        varchar(120) NOT NULL,

    source_file       varchar(64)  NOT NULL,
    loaded_at         timestamp(6) NOT NULL DEFAULT now(),

    CONSTRAINT pk_dim_platform PRIMARY KEY (platform_id),
    CONSTRAINT uq_dim_platform_name UNIQUE (platform_name),
    CONSTRAINT ck_dim_platform_weight CHECK (routing_weight > 0),
    CONSTRAINT ck_dim_platform_live   CHECK (live_from_month >= '2026-01'
                                             AND live_from_month <= '2026-07')
);

COMMENT ON TABLE  silver.dim_platform IS
    'How a model is served — the axis the invoice arrives on. Not the vendor.';
COMMENT ON COLUMN silver.dim_platform.billed_by IS
    'Who invoices us. dim_model.vendor is who built it; they often differ.';
COMMENT ON COLUMN silver.dim_platform.live_from_month IS
    'First month this route exists. Bedrock opening in June is the step change.';
COMMENT ON COLUMN silver.dim_platform.availability IS
    'Internal reach per month — how much of the bank could actually call it.';

-- =============================================================================
-- Iceberg / Trino equivalent
-- =============================================================================
-- 6 rows. Unpartitioned, broadcast everywhere.
--
--   CREATE TABLE silver.dim_platform ( ... )
--   WITH (format = 'PARQUET', format_version = 2);
-- =============================================================================

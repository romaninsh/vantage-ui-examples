-- =============================================================================
-- GRAIN: one row per internal application. 15 rows.
-- =============================================================================
--
-- The products that consume tokens. Every fact row attributes its spend to one
-- of these, so this is what turns "the bank spent $84.94M" into "Claude Code
-- spent it".
--
-- THE OWNER IS AN ORG UNIT, NOT A STRING. owner_org_id points at a real
-- department in dim_org_unit, so "which apps does this division own" is a join
-- rather than a text match, and an app cannot be owned by a department that
-- does not exist. The YAML names the department in business terms and the
-- generator resolves the id, because names are authored and stable while ids
-- are generated and would rot on the next re-expansion.
--
-- OWNER IS NOT CONSUMER, and conflating them is the mistake this schema exists
-- to prevent. Ask Northcrest is built by Enterprise Technology and used by all
-- 500,000 people. Who consumes an app is a fact with its own grain; it lives in
-- fct_usage, and rolling it up by owning department would make every platform
-- team look like the biggest spender in the bank.
--
-- STATUS IS THE PRODUCT'S OWN. The same app is live in one team and still
-- piloting in another — that rollout state varies by consumer, so it belongs on
-- the fact, not on this row.
--
-- NO UNIT LIST. primary_unit is the default tab, nothing more. Which units an
-- app actually reports is whatever rows exist in fct_app_output: derived, so it
-- cannot disagree with the data.
--
-- Source: schema/catalog/apps.yaml via scripts/silver/apps.mjs
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS silver;

DROP TABLE IF EXISTS silver.dim_app CASCADE;

CREATE TABLE silver.dim_app (
    app_id              varchar(12)  NOT NULL,
    app_name            varchar(60)  NOT NULL,
    description         varchar(160) NOT NULL,

    -- ---- ownership ----------------------------------------------------------
    owner_org_id        varchar(16)  NOT NULL,
    -- denormalised for readability; the id is the join key
    owner_department    varchar(120) NOT NULL,
    owner_division      varchar(120) NOT NULL,
    owner_lob_id        varchar(16)  NOT NULL,
    owner_lob_name      varchar(80)  NOT NULL,

    -- ---- lifecycle ----------------------------------------------------------
    status              varchar(16)  NOT NULL,   -- development | pilot | production | sunset
    audience            varchar(20)  NOT NULL,   -- internal | customer_facing
    launched_month      char(7)      NOT NULL,

    -- Default unit for the breakdown. The full set is derived from the fact.
    primary_unit        varchar(16)  NOT NULL,

    -- What the app is FOR. Behaviour profiles reach for a kind, not a name, so
    -- adding an app needs no change to any profile.
    kind                varchar(16)  NOT NULL,
    -- The Overview filter's three buckets. A rollup of `kind`, stored rather
    -- than derived so the dashboard groups on a column instead of a CASE.
    usage_driver        varchar(16)  NOT NULL,

    source_file         varchar(64)  NOT NULL,
    loaded_at           timestamp(6) NOT NULL DEFAULT now(),

    CONSTRAINT pk_dim_app PRIMARY KEY (app_id),
    CONSTRAINT uq_dim_app_name UNIQUE (app_name),

    CONSTRAINT fk_dim_app_owner
        FOREIGN KEY (owner_org_id) REFERENCES silver.dim_org_unit (org_id),

    CONSTRAINT ck_dim_app_status   CHECK (status IN ('development', 'pilot', 'production', 'sunset')),
    CONSTRAINT ck_dim_app_audience CHECK (audience IN ('internal', 'customer_facing')),
    CONSTRAINT ck_dim_app_unit     CHECK (primary_unit IN
        ('prompts', 'documents', 'rows', 'cases', 'sessions', 'reviews', 'reports', 'scans')),
    CONSTRAINT ck_dim_app_kind     CHECK (kind IN
        ('coding', 'assistant', 'domain', 'agent', 'analysis', 'research')),
    CONSTRAINT ck_dim_app_driver   CHECK (usage_driver IN
        ('developer', 'application', 'productivity'))
);

CREATE INDEX ix_dim_app_owner  ON silver.dim_app (owner_org_id);
CREATE INDEX ix_dim_app_lob    ON silver.dim_app (owner_lob_id);
CREATE INDEX ix_dim_app_status ON silver.dim_app (status, audience);
CREATE INDEX ix_dim_app_driver ON silver.dim_app (usage_driver);

COMMENT ON TABLE  silver.dim_app IS
    'One row per internal app. Owner is an org unit; consumers are a fact.';
COMMENT ON COLUMN silver.dim_app.owner_org_id IS
    'Department that builds it. NOT who uses it — see fct_usage.';
COMMENT ON COLUMN silver.dim_app.status IS
    'The product lifecycle state. Per-consumer rollout state is on the fact.';
COMMENT ON COLUMN silver.dim_app.primary_unit IS
    'Default breakdown unit. The reported set is derived from fct_app_output.';

-- =============================================================================
-- Iceberg / Trino equivalent
-- =============================================================================
-- 15 rows. Unpartitioned, broadcast everywhere.
--
--   CREATE TABLE silver.dim_app ( ... )
--   WITH (format = 'PARQUET', format_version = 2);
-- =============================================================================

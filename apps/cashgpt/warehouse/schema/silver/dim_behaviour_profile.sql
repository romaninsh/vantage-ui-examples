-- =============================================================================
-- GRAIN: one row per behavioural profile. 11 rows.
-- =============================================================================
--
-- The parameters the simulator plays out. Loaded rather than left in YAML so a
-- question like "what does a RUNAWAY actually look like" is answerable in SQL
-- next to the rows it produced.
--
-- ABSTAINER IS A PROFILE. Non-adoption is a decision, not an absence, and the
-- largest single group in the bank. Making it explicit means adoption rate is
-- something the simulation produces rather than a target imposed on it.
--
-- Source: schema/catalog/behaviour.yaml via scripts/silver/behaviour.mjs
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS silver;
DROP TABLE IF EXISTS silver.dim_behaviour_profile CASCADE;

CREATE TABLE silver.dim_behaviour_profile (
    profile_code       varchar(20)   NOT NULL,
    profile_name       varchar(40)   NOT NULL,
    note               varchar(400)  NOT NULL,

    adopt_prob         numeric(4,3)  NOT NULL,   -- ever starts at all
    start_month_min    smallint      NOT NULL,
    start_month_max    smallint      NOT NULL,
    churn_prob         numeric(4,3)  NOT NULL,   -- monthly, once started

    -- lognormal tokens per active month, before grade and discipline scaling
    intensity_median   bigint        NOT NULL,
    intensity_sigma    numeric(4,2)  NOT NULL,
    -- spread around their OWN level, not around the population mean
    volatility         numeric(4,2)  NOT NULL,

    models_min         smallint      NOT NULL,
    models_max         smallint      NOT NULL,
    apps_min           smallint      NOT NULL,
    apps_max           smallint      NOT NULL,

    novelty            numeric(4,2)  NOT NULL,   -- pull toward newly launched models
    spike_prob         numeric(4,3)  NOT NULL,
    spike_mult_min     numeric(6,2)  NOT NULL,
    spike_mult_max     numeric(6,2)  NOT NULL,

    source_file        varchar(64)   NOT NULL,
    loaded_at          timestamp(6)  NOT NULL DEFAULT now(),

    CONSTRAINT pk_dim_behaviour_profile PRIMARY KEY (profile_code),
    CONSTRAINT ck_bp_start  CHECK (start_month_min BETWEEN 1 AND 7
                                   AND start_month_max BETWEEN 1 AND 7
                                   AND start_month_min <= start_month_max),
    CONSTRAINT ck_bp_range  CHECK (models_min <= models_max AND apps_min <= apps_max),
    CONSTRAINT ck_bp_spike  CHECK (spike_mult_min <= spike_mult_max),
    CONSTRAINT ck_bp_prob   CHECK (adopt_prob BETWEEN 0 AND 1
                                   AND churn_prob BETWEEN 0 AND 1
                                   AND novelty BETWEEN 0 AND 1
                                   AND spike_prob BETWEEN 0 AND 1)
);

COMMENT ON TABLE silver.dim_behaviour_profile IS
    'Simulator parameters, one row per behaviour. ABSTAINER is a profile, not a gap.';

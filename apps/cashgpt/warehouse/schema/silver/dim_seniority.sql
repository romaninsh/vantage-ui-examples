-- =============================================================================
-- GRAIN: one row per seniority grade. 8 rows.
-- =============================================================================
--
-- The title ladder, Analyst to Executive. Tiny, but it has to exist before
-- dim_employee because three generators read it: the employee generator needs
-- population_share to shape the pyramid, the management-line generator needs
-- heads_org_level_min/max to decide who can run a team versus a division, and
-- the usage generators need seniority_rank to weight intensity.
--
-- WHY A TABLE AND NOT A TEXT COLUMN ON dim_employee. Rank, band and management
-- scope are attributes of the GRADE, not of the person. Denormalising them onto
-- 500,000 employee rows would repeat the same eight tuples 62,500 times each
-- and put the ordering of the ladder — which every "seniority" sort depends on
-- — in application code instead of in the data.
--
-- WHAT IS DELIBERATELY ABSENT. seniority.yaml also carries ai_adoption and
-- ai_intensity. Those are generator inputs and are NOT loaded here: once real
-- usage exists, adoption is measured off fct_usage, and keeping an assumed
-- figure in a dimension beside the measured one is how the two silently
-- disagree.
--
-- Source: schema/org/seniority.yaml via scripts/expand-seniority.mjs
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS silver;

DROP TABLE IF EXISTS silver.dim_seniority CASCADE;

CREATE TABLE silver.dim_seniority (
    seniority_code        varchar(16)   NOT NULL,
    -- 1 junior .. 8 senior. Sort on this, never on the title.
    seniority_rank        smallint      NOT NULL,
    title                 varchar(60)   NOT NULL,
    -- internal grade, what appears on the HR record
    band_code             char(2)       NOT NULL,

    manager_eligible      boolean       NOT NULL,
    -- Range of dim_org_unit.org_level this grade typically runs.
    -- NULL for individual contributors.
    heads_org_level_min   smallint,
    heads_org_level_max   smallint,

    -- Share of the 500,000 headcount at this grade. Sums to exactly 1.
    -- decimal, not float: it is apportioned against an integer headcount and
    -- the shares have to close.
    population_share      numeric(6,5)  NOT NULL,

    source_file           varchar(64)   NOT NULL,
    loaded_at             timestamp(6)  NOT NULL DEFAULT now(),

    CONSTRAINT pk_dim_seniority PRIMARY KEY (seniority_code),
    CONSTRAINT uq_dim_seniority_rank  UNIQUE (seniority_rank),
    CONSTRAINT uq_dim_seniority_band  UNIQUE (band_code),

    CONSTRAINT ck_dim_seniority_rank  CHECK (seniority_rank BETWEEN 1 AND 8),
    CONSTRAINT ck_dim_seniority_share CHECK (population_share > 0 AND population_share <= 1),
    -- an IC heads nothing; a manager heads a valid, ordered range
    CONSTRAINT ck_dim_seniority_heads CHECK (
        (heads_org_level_min IS NULL AND heads_org_level_max IS NULL)
        OR (heads_org_level_min BETWEEN 1 AND 6
            AND heads_org_level_max BETWEEN 1 AND 6
            AND heads_org_level_min <= heads_org_level_max)
    ),
    -- management scope and eligibility must agree
    CONSTRAINT ck_dim_seniority_mgr CHECK (
        manager_eligible = (heads_org_level_min IS NOT NULL)
    )
);

COMMENT ON TABLE  silver.dim_seniority IS
    'One row per seniority grade, Analyst to Executive.';
COMMENT ON COLUMN silver.dim_seniority.seniority_rank IS
    'Ladder order, 1 junior to 8 senior. Sort on this, not on title.';
COMMENT ON COLUMN silver.dim_seniority.heads_org_level_min IS
    'Most senior dim_org_unit.org_level this grade runs. NULL for ICs.';
COMMENT ON COLUMN silver.dim_seniority.population_share IS
    'Share of headcount at this grade. Sums to 1 across the table.';

-- =============================================================================
-- Iceberg / Trino equivalent
-- =============================================================================
-- Eight rows. Unpartitioned, unsorted; Trino will broadcast-join it into every
-- query and never scan it twice. Constraints move to schema/tests/.
--
--   CREATE TABLE silver.dim_seniority ( ... )
--   WITH (format = 'PARQUET', format_version = 2);
-- =============================================================================

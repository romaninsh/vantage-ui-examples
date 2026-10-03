-- =============================================================================
-- GRAIN: one row per employee. 500,000 rows.
-- =============================================================================
--
-- NO HISTORY. Type 1, current state, no valid_from/valid_to. Nobody in this
-- model moves team, gets promoted or leaves, so versioning would add a range
-- predicate to every join in the project and buy nothing. If people ever start
-- moving, the cheap fix is to stamp team_org_id and seniority_code onto
-- fct_usage at event time — not to version this table.
--
-- MANAGERS ARE NOT A SEPARATE STRUCTURE. heads_org_id says "this person runs
-- that org unit", and the reporting line falls out of the org tree we already
-- built: your L6 manager heads your team, your L5 manager heads your section.
-- So there is no manager_id chain, no flattened mgr_l2..l6 columns, and no
-- bridge table. "Everyone under this section" is section_id = ?, already
-- indexed. This only works because there is no matrix reporting; a dotted line
-- would need a bridge table and there is nothing here that wants one.
--
-- ANCESTRY IS DENORMALISED, same trade as dim_org_unit: five extra varchars on
-- 500,000 rows against a recursive CTE on every dashboard query.
--
-- Source: schema/org/*.yaml via scripts/silver/employees.mjs
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS silver;

DROP TABLE IF EXISTS silver.dim_employee CASCADE;

CREATE TABLE silver.dim_employee (
    employee_id         varchar(12)  NOT NULL,
    full_name           varchar(80)  NOT NULL,

    -- ---- placement ----------------------------------------------------------
    team_org_id         varchar(16)  NOT NULL,
    team_code           char(5)      NOT NULL,

    -- ---- grade --------------------------------------------------------------
    seniority_code      varchar(16)  NOT NULL,
    -- Denormalised so "order by seniority" and "rank >= 5" need no join. Eight
    -- distinct values over 500,000 rows; Parquet and Postgres both store this
    -- for almost nothing.
    seniority_rank      smallint     NOT NULL,

    -- What they do, as distinct from how senior they are. Constrained by the
    -- department: a Legal department has no Site Reliability engineers.
    job_function        varchar(40)  NOT NULL,
    -- Discipline of the team they sit on. Denormalised because every behaviour
    -- draw in the simulator keys on it and the join is otherwise on every query.
    work_type           varchar(24),

    -- ---- where they sit -----------------------------------------------------
    -- Their OWN office, which need not be their team's. Roughly a quarter of
    -- engineering sits away from its team's home site — that is what makes the
    -- India build centre visible rather than an org-chart claim.
    site_code           varchar(8)   NOT NULL,
    city                varchar(40)  NOT NULL,
    country             varchar(40)  NOT NULL,
    location_region     varchar(30)  NOT NULL,
    -- Which naming tradition the name was drawn from. Kept because it explains
    -- the staff list, and because a name pool that has drifted is otherwise
    -- invisible until somebody reads 500,000 rows.
    name_culture        varchar(24)  NOT NULL,

    -- ---- management ---------------------------------------------------------
    -- The org unit this person runs, if any. NULL for individual contributors.
    -- Unique: an org unit has exactly one head.
    heads_org_id        varchar(16),

    -- ---- denormalised ancestry ---------------------------------------------
    section_id          varchar(16)  NOT NULL,
    department_id       varchar(16)  NOT NULL,
    division_id         varchar(16)  NOT NULL,
    lob_id              varchar(16)  NOT NULL,
    lob_name            varchar(80)  NOT NULL,

    source_file         varchar(64)  NOT NULL,
    loaded_at           timestamp(6) NOT NULL DEFAULT now(),

    CONSTRAINT pk_dim_employee PRIMARY KEY (employee_id),

    CONSTRAINT fk_dim_employee_team
        FOREIGN KEY (team_org_id)   REFERENCES silver.dim_org_unit (org_id),
    CONSTRAINT fk_dim_employee_heads
        FOREIGN KEY (heads_org_id)  REFERENCES silver.dim_org_unit (org_id),
    CONSTRAINT fk_dim_employee_seniority
        FOREIGN KEY (seniority_code) REFERENCES silver.dim_seniority (seniority_code),

    CONSTRAINT ck_dim_employee_rank CHECK (seniority_rank BETWEEN 1 AND 8)
);

-- exactly one head per org unit
CREATE UNIQUE INDEX ux_dim_employee_heads
    ON silver.dim_employee (heads_org_id) WHERE heads_org_id IS NOT NULL;

-- The four predicates every dashboard actually issues: roll up by org, filter a
-- manager's org, group by grade, group by function.
CREATE INDEX ix_dim_employee_team    ON silver.dim_employee (team_org_id);
CREATE INDEX ix_dim_employee_section ON silver.dim_employee (section_id);
CREATE INDEX ix_dim_employee_lob     ON silver.dim_employee (lob_id, seniority_rank);
CREATE INDEX ix_dim_employee_fn      ON silver.dim_employee (job_function);
CREATE INDEX ix_dim_employee_site    ON silver.dim_employee (site_code);
CREATE INDEX ix_dim_employee_region  ON silver.dim_employee (location_region);

COMMENT ON TABLE  silver.dim_employee IS
    'One row per employee. Type 1 — nobody moves, so no history.';
COMMENT ON COLUMN silver.dim_employee.heads_org_id IS
    'Org unit this person runs. NULL for ICs. The reporting line is the org tree.';
COMMENT ON COLUMN silver.dim_employee.seniority_rank IS
    'Denormalised from dim_seniority so grade filters need no join.';
COMMENT ON COLUMN silver.dim_employee.site_code IS
    'The person''s own office. Deliberately may differ from their team''s site.';
COMMENT ON COLUMN silver.dim_employee.job_function IS
    'What they do. Drawn from the mix declared for their department.';

-- =============================================================================
-- Iceberg / Trino equivalent
-- =============================================================================
-- 500,000 rows is a broadcast join, so no partitioning. Sorting by lob then
-- section clusters the manager and line-of-business scans onto adjacent files.
--
--   CREATE TABLE silver.dim_employee ( ... )
--   WITH (
--     format = 'PARQUET',
--     format_version = 2,
--     sorted_by = ARRAY['lob_id','section_id','seniority_rank']
--   );
-- =============================================================================

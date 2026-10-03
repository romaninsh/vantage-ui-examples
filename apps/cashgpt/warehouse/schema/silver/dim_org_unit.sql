-- =============================================================================
-- GRAIN: one row per organisational unit, from the group down to the team.
-- =============================================================================
--
-- The management/HR tree. Everything hangs off this: employees belong to a
-- team, spend rolls up through it, Manager Console and Team Efficiency read it
-- directly. ~43,000 rows for a 500,000-person bank.
--
-- ANCESTORS ARE DENORMALISED ON PURPOSE. lob_id/division_id/department_id are
-- carried on every row so "everything under this line of business" is a single
-- equality predicate. The alternative is a recursive CTE on every query, which
-- Trino handles badly and which defeats partition pruning. The cost is that a
-- reparent has to rewrite descendants — org changes are rare and batched, so
-- that trade is worth making.
--
-- NOT SCD2. Org units are renamed and merged, but they do not move often enough
-- to justify history here, and no dashboard asks "what was this unit called in
-- March". People move teams constantly, so dim_employee IS versioned — that is
-- where the history that matters lives.
--
-- Source: schema/org/org-chart.yaml, expanded by scripts/silver/org-units.mjs
-- Postgres locally; the Iceberg/Trino equivalent is noted at the foot.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS silver;

DROP TABLE IF EXISTS silver.dim_org_unit CASCADE;

CREATE TABLE silver.dim_org_unit (
    -- ---- identity -----------------------------------------------------------
    org_id              varchar(16)  NOT NULL,
    parent_org_id       varchar(16),                 -- NULL only for the group root
    org_level           smallint     NOT NULL,       -- 1 group .. 6 team
    org_level_name      varchar(24)  NOT NULL,       -- Group | Line of business | Division | Department | Section | Team
    org_name            varchar(120) NOT NULL,

    -- Five-digit cost-centre code. Teams only; this is what people quote in
    -- chargeback disputes and what the drill-downs link on.
    team_code           char(5),

    -- ---- denormalised ancestry ---------------------------------------------
    lob_id              varchar(16),
    lob_name            varchar(80),
    division_id         varchar(16),
    division_name       varchar(120),
    department_id       varchar(16),
    department_name     varchar(120),
    section_id          varchar(16),
    section_name        varchar(120),

    -- Materialised path, slash-delimited root-first. Cheap prefix matching for
    -- "everything under X" at any depth, without another recursive query.
    org_path            varchar(120) NOT NULL,

    -- ---- attributes ---------------------------------------------------------
    -- The HR reporting segment. A DIFFERENT tree from this one: five segments
    -- that cut across lines of business. Carried as an attribute rather than
    -- modelled as a hierarchy because nothing drills through it.
    resource_org        varchar(40)  NOT NULL,

    -- The discipline of the unit: ops, service, engineering, advisory, control,
    -- analytics, markets, people, facilities. Declared per department in the
    -- YAML and inherited down to teams; NULL above department. Drives which job
    -- functions and which grades staff the unit, and is worth grouping spend by
    -- in its own right.
    work_type           varchar(24),

    -- ---- where it sits ------------------------------------------------------
    -- How this kind of team is staffed. Named in schema/org/locations.yaml and
    -- resolved from (line of business, work_type) at expansion time.
    hiring_profile      varchar(24),
    -- The team's HOME office, on level-6 rows only. Individuals are placed
    -- around it, so a London-led team can be four-fifths Pune; a person's own
    -- office is on dim_employee, and the two disagree on purpose.
    site_code           varchar(8),
    city                varchar(40),
    country             varchar(40),
    location_region     varchar(30),

    -- Planned headcount. Rolls up exactly: a parent equals the sum of its
    -- children, all the way to 500,000 at the root.
    headcount           integer      NOT NULL,

    is_leaf             boolean      NOT NULL,

    -- ---- lineage ------------------------------------------------------------
    source_file         varchar(64)  NOT NULL,
    loaded_at           timestamp(6) NOT NULL DEFAULT now(),

    CONSTRAINT pk_dim_org_unit PRIMARY KEY (org_id),
    -- Self-referencing, so deferred: a bulk COPY should not depend on parents
    -- happening to appear before children in the file.
    CONSTRAINT fk_dim_org_unit_parent
        FOREIGN KEY (parent_org_id) REFERENCES silver.dim_org_unit (org_id)
        DEFERRABLE INITIALLY DEFERRED,

    CONSTRAINT ck_dim_org_unit_level      CHECK (org_level BETWEEN 1 AND 6),
    CONSTRAINT ck_dim_org_unit_headcount  CHECK (headcount >= 0),
    -- team_code exists if and only if the row is a team
    CONSTRAINT ck_dim_org_unit_team_code  CHECK ((org_level = 6) = (team_code IS NOT NULL)),
    -- only the root is parentless
    CONSTRAINT ck_dim_org_unit_root       CHECK ((org_level = 1) = (parent_org_id IS NULL))
);

-- Ancestry lookups are the hot path: every dashboard filters by LOB or drills a
-- manager's org. These four cover it.
CREATE INDEX ix_dim_org_unit_parent  ON silver.dim_org_unit (parent_org_id);
CREATE INDEX ix_dim_org_unit_lob     ON silver.dim_org_unit (lob_id, org_level);
CREATE INDEX ix_dim_org_unit_level   ON silver.dim_org_unit (org_level);
CREATE INDEX ix_dim_org_unit_work    ON silver.dim_org_unit (work_type);
CREATE INDEX ix_dim_org_unit_site    ON silver.dim_org_unit (site_code);
CREATE UNIQUE INDEX ux_dim_org_unit_team_code
    ON silver.dim_org_unit (team_code) WHERE team_code IS NOT NULL;
-- prefix matching for org_path LIKE 'L1/LB-05/%'
CREATE INDEX ix_dim_org_unit_path    ON silver.dim_org_unit (org_path varchar_pattern_ops);

COMMENT ON TABLE  silver.dim_org_unit IS
    'One row per organisational unit, group to team. Ancestors denormalised.';
COMMENT ON COLUMN silver.dim_org_unit.team_code IS
    'Five-digit cost centre. Teams only. The code quoted in chargeback.';
COMMENT ON COLUMN silver.dim_org_unit.org_path IS
    'Slash-delimited root-first path, for prefix matching at any depth.';
COMMENT ON COLUMN silver.dim_org_unit.site_code IS
    'The team home office, level 6 only. A person''s own office is on dim_employee.';
COMMENT ON COLUMN silver.dim_org_unit.hiring_profile IS
    'How this kind of team is staffed — see schema/org/locations.yaml.';
COMMENT ON COLUMN silver.dim_org_unit.resource_org IS
    'HR reporting segment. Cuts across lines of business; attribute, not hierarchy.';

-- =============================================================================
-- Iceberg / Trino equivalent
-- =============================================================================
-- No PK/FK/CHECK — Iceberg enforces none of them, so the constraints above
-- become assertions in schema/tests/. The table is small and read whole, so it
-- is unpartitioned; sorting by path keeps ancestry scans on adjacent files.
--
--   CREATE TABLE silver.dim_org_unit ( ... )
--   WITH (
--     format = 'PARQUET',
--     format_version = 2,
--     sorted_by = ARRAY['org_path']
--   );
-- =============================================================================

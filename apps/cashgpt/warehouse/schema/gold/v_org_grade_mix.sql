-- =============================================================================
-- GRAIN: one row per department per grade. ~1,700 rows.
-- =============================================================================
-- Long format on purpose: Metabase pivots long data, and a wide table would
-- need a new column every time the ladder changes.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;

CREATE OR REPLACE VIEW gold.v_org_grade_mix AS
SELECT
    e.lob_name,
    d.division_name,
    d.department_name,
    d.work_type,
    s.seniority_rank        AS grade_rank,
    s.title                 AS grade,
    count(*)                AS employees,
    round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY e.department_id), 1) AS pct_of_department
FROM silver.dim_employee e
JOIN silver.dim_org_unit  d ON d.org_id = e.department_id
JOIN silver.dim_seniority s ON s.seniority_code = e.seniority_code
GROUP BY e.lob_name, d.division_name, d.department_name, d.work_type,
         s.seniority_rank, s.title, e.department_id;

COMMENT ON VIEW gold.v_org_grade_mix IS
    'Grade mix per department, long format. Shows the seniority tilt by discipline.';

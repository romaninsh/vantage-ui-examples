-- =============================================================================
-- GRAIN: one row per org unit. Browsing view — the hierarchy, readable.
-- =============================================================================
-- Sorting by org_path gives depth-first order for free: a materialised path
-- sorts parents before children without a recursive query or a sort key column.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;

CREATE OR REPLACE VIEW gold.v_org_tree AS
WITH staffed AS (
    -- five cheap grouped passes over dim_employee, one per ancestor column,
    -- instead of one path-prefix join across 47k x 40k rows
    SELECT lob_id        AS org_id, count(*) AS employees FROM silver.dim_employee GROUP BY 1
    UNION ALL SELECT division_id,   count(*) FROM silver.dim_employee GROUP BY 1
    UNION ALL SELECT department_id, count(*) FROM silver.dim_employee GROUP BY 1
    UNION ALL SELECT section_id,    count(*) FROM silver.dim_employee GROUP BY 1
    UNION ALL SELECT team_org_id,   count(*) FROM silver.dim_employee GROUP BY 1
    UNION ALL SELECT 'GRP',         count(*) FROM silver.dim_employee
)
SELECT
    o.org_path,
    o.org_level,
    o.org_level_name,
    repeat('·  ', o.org_level - 1) || o.org_name  AS tree,
    o.org_name,
    o.lob_name,
    o.division_name,
    o.department_name,
    o.work_type,
    o.team_code,
    o.resource_org,
    o.headcount                                    AS planned_headcount,
    st.employees,
    h.full_name                                    AS head_name,
    s.title                                        AS head_grade,
    (SELECT count(*) FROM silver.dim_org_unit c WHERE c.parent_org_id = o.org_id) AS child_units
FROM silver.dim_org_unit o
LEFT JOIN staffed st            ON st.org_id = o.org_id
LEFT JOIN silver.dim_employee h ON h.heads_org_id = o.org_id
LEFT JOIN silver.dim_seniority s ON s.seniority_code = h.seniority_code
ORDER BY o.org_path;

COMMENT ON VIEW gold.v_org_tree IS
    'Org hierarchy, indented. Filter org_level <= 4 for a browsable 286 rows.';

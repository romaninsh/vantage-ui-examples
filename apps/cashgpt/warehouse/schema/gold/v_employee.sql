-- =============================================================================
-- GRAIN: one row per employee. Browsing view — every attribute resolved.
-- =============================================================================
-- Saves writing the same three joins by hand every time. Not a mart: no
-- measures, nothing pre-aggregated.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;

CREATE OR REPLACE VIEW gold.v_employee AS
SELECT
    e.employee_id,
    e.full_name,
    s.title                 AS grade,
    e.seniority_rank        AS grade_rank,
    s.band_code,
    e.job_function,
    t.org_name              AS team_name,
    e.team_code,
    o_sec.org_name          AS section_name,
    e.department_id,
    t.department_name,
    t.division_name,
    e.lob_name,
    t.work_type,
    t.resource_org,
    e.heads_org_id IS NOT NULL           AS is_manager,
    hd.org_level_name                    AS heads_level,
    hd.org_name                          AS heads_unit,
    mgr.full_name                        AS reports_to
FROM silver.dim_employee e
JOIN silver.dim_seniority s   ON s.seniority_code = e.seniority_code
JOIN silver.dim_org_unit  t   ON t.org_id = e.team_org_id
LEFT JOIN silver.dim_org_unit o_sec ON o_sec.org_id = e.section_id
LEFT JOIN silver.dim_org_unit hd    ON hd.org_id = e.heads_org_id
-- The reporting line IS the org tree: your manager is whoever heads your team,
-- or your section if you head the team yourself.
LEFT JOIN silver.dim_employee mgr
       ON mgr.heads_org_id = CASE WHEN e.heads_org_id = e.team_org_id
                                  THEN e.section_id ELSE e.team_org_id END;

COMMENT ON VIEW gold.v_employee IS
    'Employee with grade, org path and manager resolved. Browsing, not a mart.';

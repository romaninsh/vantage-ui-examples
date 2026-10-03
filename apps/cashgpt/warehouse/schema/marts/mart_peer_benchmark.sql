-- =============================================================================
-- GRAIN: one row per active person per month, with their peer group's stats.
--        ~1.7M rows.
-- =============================================================================
--
-- What the Watchtower is. A person's spend means nothing on its own; it means
-- something against the people doing the same job beside them.
--
-- THE PEER MEAN EXCLUDES THE PERSON THEMSELVES. This is the whole table. A
-- $112k outlier sitting in a team of 18 whose others spend $400 will, if it is
-- included in its own baseline, report a peer mean of $6,600 and a multiple of
-- 17x. Leave it out and the mean is $400 and the multiple is 263x — which is
-- the true statement and the reason anybody would look at the row.
--
-- The leave-one-out mean is algebraic, not a self-join:
--
--     mean_without_me = (group_total - mine) / (group_count - 1)
--
-- The same trick gives the standard deviation, from the group's sum of squares.
-- Both are one window pass; a correlated subquery per person would be 1.7M
-- scans.
--
-- THREE PEER GROUPS, because "peers" means different things to different
-- questions: the people on my team, the people with my job title across the
-- bank, and the people at my grade in my line of business. The dashboard tabs
-- between them, so all three are precomputed.
--
-- Source: gold.mart_employee_month. Rebuilt after every simulation run.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;
DROP TABLE IF EXISTS gold.mart_peer_benchmark CASCADE;

CREATE TABLE gold.mart_peer_benchmark AS
WITH base AS (
    SELECT month_key, employee_id, full_name, spend_usd, tokens,
           team_org_id, team_name, team_code, job_function, seniority_code,
           lob_id, lob_name, resource_org, org_path, department_id, section_id,
           top_platform_id, top_model_id, top_tier_share, had_spike
    FROM gold.mart_employee_month
),
-- One pass per peer definition. Sum and sum-of-squares are what make the
-- leave-one-out statistics algebraic.
windowed AS (
    SELECT b.*,
        -- team
        count(*)        OVER w_team AS team_n,
        sum(spend_usd)  OVER w_team AS team_sum,
        sum(spend_usd * spend_usd) OVER w_team AS team_sq,
        -- same job title, bank-wide
        count(*)        OVER w_func AS func_n,
        sum(spend_usd)  OVER w_func AS func_sum,
        sum(spend_usd * spend_usd) OVER w_func AS func_sq,
        -- same grade inside the same line of business
        count(*)        OVER w_grade AS grade_n,
        sum(spend_usd)  OVER w_grade AS grade_sum,
        sum(spend_usd * spend_usd) OVER w_grade AS grade_sq
    FROM base b
    WINDOW
        w_team  AS (PARTITION BY month_key, team_org_id),
        w_func  AS (PARTITION BY month_key, job_function),
        w_grade AS (PARTITION BY month_key, lob_id, seniority_code)
),
loo AS (
    SELECT w.*,
        CASE WHEN team_n > 1 THEN (team_sum - spend_usd) / (team_n - 1) END AS team_mean,
        CASE WHEN func_n > 1 THEN (func_sum - spend_usd) / (func_n - 1) END AS func_mean,
        CASE WHEN grade_n > 1 THEN (grade_sum - spend_usd) / (grade_n - 1) END AS grade_mean,
        -- population sd of the group with this row removed
        CASE WHEN team_n > 2 THEN sqrt(GREATEST(
            (team_sq - spend_usd * spend_usd) / (team_n - 1)
            - power((team_sum - spend_usd) / (team_n - 1), 2), 0)) END AS team_sd,
        CASE WHEN func_n > 2 THEN sqrt(GREATEST(
            (func_sq - spend_usd * spend_usd) / (func_n - 1)
            - power((func_sum - spend_usd) / (func_n - 1), 2), 0)) END AS func_sd,
        CASE WHEN grade_n > 2 THEN sqrt(GREATEST(
            (grade_sq - spend_usd * spend_usd) / (grade_n - 1)
            - power((grade_sum - spend_usd) / (grade_n - 1), 2), 0)) END AS grade_sd
    FROM windowed w
)
SELECT
    month_key, employee_id, full_name, spend_usd, tokens,
    team_org_id, team_name, team_code, job_function, seniority_code,
    lob_id, lob_name, resource_org, org_path, department_id, section_id,
    top_platform_id, top_model_id, top_tier_share, had_spike,

    (team_n - 1)::int  AS team_peers,
    (func_n - 1)::int  AS func_peers,
    (grade_n - 1)::int AS grade_peers,

    round(team_mean, 2)  AS team_mean,
    round(func_mean, 2)  AS func_mean,
    round(grade_mean, 2) AS grade_mean,

    -- How many times their peers' spend. NULL rather than infinity when the
    -- peer mean is zero: "everyone else spent nothing" is not a multiple.
    round(CASE WHEN team_mean  > 0 THEN spend_usd / team_mean  END, 2) AS team_multiple,
    round(CASE WHEN func_mean  > 0 THEN spend_usd / func_mean  END, 2) AS func_multiple,
    round(CASE WHEN grade_mean > 0 THEN spend_usd / grade_mean END, 2) AS grade_multiple,

    -- How unusual, in standard deviations above the peer mean.
    round(CASE WHEN team_sd  > 0 THEN (spend_usd - team_mean)  / team_sd  END, 2) AS team_sigma,
    round(CASE WHEN func_sd  > 0 THEN (spend_usd - func_mean)  / func_sd  END, 2) AS func_sigma,
    round(CASE WHEN grade_sd > 0 THEN (spend_usd - grade_mean) / grade_sd END, 2) AS grade_sigma
FROM loo;

ALTER TABLE gold.mart_peer_benchmark
    ADD CONSTRAINT pk_mpb PRIMARY KEY (month_key, employee_id);

-- The Watchtower orders by unusualness within a month, so these carry the table.
CREATE INDEX ix_mpb_team_sigma  ON gold.mart_peer_benchmark (month_key, team_sigma DESC NULLS LAST);
CREATE INDEX ix_mpb_func_sigma  ON gold.mart_peer_benchmark (month_key, func_sigma DESC NULLS LAST);
CREATE INDEX ix_mpb_grade_sigma ON gold.mart_peer_benchmark (month_key, grade_sigma DESC NULLS LAST);
CREATE INDEX ix_mpb_spend       ON gold.mart_peer_benchmark (month_key, spend_usd DESC);
CREATE INDEX ix_mpb_lob         ON gold.mart_peer_benchmark (lob_id, month_key);
CREATE INDEX ix_mpb_employee    ON gold.mart_peer_benchmark (employee_id);

ANALYZE gold.mart_peer_benchmark;

COMMENT ON TABLE gold.mart_peer_benchmark IS
    'Person against peers, three peer definitions. Means are leave-one-out — an outlier must not inflate its own baseline.';

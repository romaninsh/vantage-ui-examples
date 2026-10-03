-- =============================================================================
-- GRAIN: one row per employee that has been simulated.
-- =============================================================================
--
-- What the simulator DREW for this person, kept so a result can be explained
-- rather than just observed. When the Watchtower flags somebody at 200x their
-- team, this is the row that says why: RUNAWAY profile, spiked in June,
-- personal level nine times their grade's median.
--
-- WRITTEN BY THE SIMULATOR, NOT A GENERATOR. Re-running one employee replaces
-- their row here and their rows in fct_usage, in one transaction. Everyone
-- else is untouched.
--
-- Source: scripts/sim/simulate.mjs
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS silver;
DROP TABLE IF EXISTS silver.dim_employee_behaviour CASCADE;

CREATE TABLE silver.dim_employee_behaviour (
    employee_id        varchar(12)   NOT NULL,
    profile_code       varchar(20)   NOT NULL,

    adopted            boolean       NOT NULL,
    -- NULL when they never started
    start_month        char(7),
    -- NULL when they never stopped
    churn_month        char(7),
    active_months      smallint      NOT NULL,

    -- Their own baseline, after grade and discipline scaling. This is what
    -- monthly volatility varies around — the reason one person's chart looks
    -- like a person and not like noise.
    personal_tokens_pm bigint        NOT NULL,
    spike_months       smallint      NOT NULL,
    peak_month         char(7),

    sim_seed           bigint        NOT NULL,
    simulated_at       timestamp(6)  NOT NULL DEFAULT now(),

    CONSTRAINT pk_dim_employee_behaviour PRIMARY KEY (employee_id),
    CONSTRAINT fk_deb_employee FOREIGN KEY (employee_id)
        REFERENCES silver.dim_employee (employee_id),
    CONSTRAINT fk_deb_profile  FOREIGN KEY (profile_code)
        REFERENCES silver.dim_behaviour_profile (profile_code),
    -- a start month exists if and only if they adopted
    CONSTRAINT ck_deb_start CHECK (adopted = (start_month IS NOT NULL)),
    CONSTRAINT ck_deb_months CHECK (active_months >= 0 AND active_months <= 7)
);

CREATE INDEX ix_deb_profile ON silver.dim_employee_behaviour (profile_code);
CREATE INDEX ix_deb_adopted ON silver.dim_employee_behaviour (adopted);

COMMENT ON TABLE silver.dim_employee_behaviour IS
    'What the simulator drew per person. Explains an outlier rather than just producing one.';

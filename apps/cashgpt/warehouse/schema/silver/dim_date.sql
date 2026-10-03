-- =============================================================================
-- GRAIN: one row per calendar day. 212 rows, 1 Jan – 31 Jul 2026.
-- =============================================================================
--
-- WHY IT EXISTS AT ALL. fct_usage is at day grain, so without this every
-- "group by month" is a date_trunc over 38M rows and every weekday filter has
-- nowhere to live. A date dimension is 212 rows and turns both into a join
-- against a table small enough to broadcast.
--
-- WHY THE WORKING-DAY COLUMNS EARN THEIR PLACE. Nothing on the dashboards shows
-- a day. What they show is month-over-month, and months are not comparable:
-- Jan 2026 has 21 working days, Apr has 20, May has 19. A 5% month-over-month
-- move can be entirely calendar. working_days_in_month is what lets a query say
-- "up 15%, or up 9% per working day" — which is the difference between a number
-- an executive can act on and one they can be argued out of.
--
-- WHY HOLIDAYS. Marginal on their own — five days in range, 2.4% of the period.
-- They matter because usage collapses on them, and if the generated fact does
-- not collapse too, daily data looks synthetic the moment anyone drills in.
-- England and Wales only; Scotland and Northern Ireland differ, and a real
-- multi-country calendar would be its own dimension keyed by jurisdiction.
--
-- Source: scripts/silver/dates.mjs
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS silver;

DROP TABLE IF EXISTS silver.dim_date CASCADE;

CREATE TABLE silver.dim_date (
    date_key                date         NOT NULL,

    -- ---- calendar -----------------------------------------------------------
    year_num                smallint     NOT NULL,
    quarter_num             smallint     NOT NULL,
    month_num               smallint     NOT NULL,
    -- '2026-07'. The join key for every monthly rollup; sorts correctly as text
    -- and needs no date functions in the query.
    month_key               char(7)      NOT NULL,
    month_name              varchar(12)  NOT NULL,
    month_short             char(3)      NOT NULL,
    month_start             date         NOT NULL,
    month_end               date         NOT NULL,
    days_in_month           smallint     NOT NULL,

    day_of_month            smallint     NOT NULL,
    -- ISO: 1 Monday .. 7 Sunday
    day_of_week             smallint     NOT NULL,
    day_name                varchar(10)  NOT NULL,
    iso_week                smallint     NOT NULL,

    -- ---- working calendar ---------------------------------------------------
    is_weekend              boolean      NOT NULL,
    is_holiday              boolean      NOT NULL,
    holiday_name            varchar(40),
    is_working_day          boolean      NOT NULL,

    -- Position of this day among the month's working days, and how many the
    -- month has. The second is what makes month-over-month defensible.
    working_day_of_month    smallint,
    working_days_in_month   smallint     NOT NULL,

    source_file             varchar(64)  NOT NULL,
    loaded_at               timestamp(6) NOT NULL DEFAULT now(),

    CONSTRAINT pk_dim_date PRIMARY KEY (date_key),

    CONSTRAINT ck_dim_date_month     CHECK (month_num BETWEEN 1 AND 12),
    CONSTRAINT ck_dim_date_dow       CHECK (day_of_week BETWEEN 1 AND 7),
    CONSTRAINT ck_dim_date_weekend   CHECK (is_weekend = (day_of_week >= 6)),
    -- a working day is a weekday that is not a holiday; keep the derivation honest
    CONSTRAINT ck_dim_date_working   CHECK (is_working_day = (NOT is_weekend AND NOT is_holiday)),
    -- holiday_name exists if and only if it is a holiday
    CONSTRAINT ck_dim_date_holiday   CHECK (is_holiday = (holiday_name IS NOT NULL)),
    -- working_day_of_month is set on working days only
    CONSTRAINT ck_dim_date_wdom      CHECK (is_working_day = (working_day_of_month IS NOT NULL))
);

CREATE INDEX ix_dim_date_month   ON silver.dim_date (month_key);
CREATE INDEX ix_dim_date_working ON silver.dim_date (is_working_day);

COMMENT ON TABLE  silver.dim_date IS
    'One row per day, Jan-Jul 2026. England and Wales working calendar.';
COMMENT ON COLUMN silver.dim_date.month_key IS
    'YYYY-MM. Join key for monthly rollups; no date functions needed.';
COMMENT ON COLUMN silver.dim_date.working_days_in_month IS
    'Lets month-over-month be stated per working day, not just per month.';

-- =============================================================================
-- Iceberg / Trino equivalent
-- =============================================================================
-- 212 rows. Unpartitioned, broadcast into every query.
--
--   CREATE TABLE silver.dim_date ( ... )
--   WITH (format = 'PARQUET', format_version = 2);
-- =============================================================================

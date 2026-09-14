-- Vantage releases warehouse — schema (bronze / silver / gold)
--
-- Bronze  : raw_payload          immutable JSON fetched from GitHub / crates.io
-- Silver  : repo, package, release_, pull_request, dependency_pin
-- Gold    : dependency_bump, changelog_entry (+ data/changelog.md built from it)
-- Meta    : sync_run             one row per script execution
--
-- Model notes:
--   * repo    = GitHub source repo (atk4/vantage-ui app, romaninsh/vantage deps).
--   * package = a crate with its own version series (vantage-ui + vantage-*).
--     Dependency crates all publish from the deps monorepo, versioned via crates.io.
--   * release_ rows hang off packages. App releases come from Cargo.toml at git
--     tags (+ HEAD); dependency releases come from crates.io publish timestamps.
--   * PRs hang off repos. App PRs get release_id directly (1:N). Dep-repo PRs
--     can bump several crates at once -> release_pr is many-to-many.
--
-- All scripts are idempotent: natural-key upserts, never destructive.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- meta ------

CREATE TABLE IF NOT EXISTS sync_run (
    id          INTEGER PRIMARY KEY,
    script      TEXT NOT NULL,
    started_at  TEXT NOT NULL,            -- ISO-8601 UTC
    finished_at TEXT,
    status      TEXT NOT NULL DEFAULT 'running',  -- running|ok|error
    detail      TEXT
);

-- ---------------------------------------------------------------- bronze ----

-- One row per fetched API resource. Append-only; transform reads the newest
-- payload per (kind, repo, identifier).
CREATE TABLE IF NOT EXISTS raw_payload (
    id          INTEGER PRIMARY KEY,
    run_id      INTEGER REFERENCES sync_run(id),
    kind        TEXT NOT NULL,            -- pull_request|release|tag|cargo_toml|crate_version
    repo        TEXT NOT NULL,            -- "owner/name" (crate name for crate_version)
    identifier  TEXT NOT NULL,            -- PR number / tag / ref / version
    payload     TEXT NOT NULL,            -- JSON
    fetched_at  TEXT NOT NULL,
    UNIQUE (kind, repo, identifier, fetched_at)
);

-- ---------------------------------------------------------------- silver ----

CREATE TABLE IF NOT EXISTS repo (
    id          INTEGER PRIMARY KEY,
    owner       TEXT NOT NULL,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL,            -- app | deps
    url         TEXT,
    UNIQUE (owner, name)
);

-- A crate with its own version series.
CREATE TABLE IF NOT EXISTS package (
    id          INTEGER PRIMARY KEY,
    repo_id     INTEGER NOT NULL REFERENCES repo(id),
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL,            -- app | dependency
    UNIQUE (repo_id, name),
    UNIQUE (name)
);

-- One row per crate version.
-- status: published (tag / crates.io) | draft (GH draft release)
--       | unreleased (Cargo.toml on default branch, never built)
CREATE TABLE IF NOT EXISTS release_ (
    id          INTEGER PRIMARY KEY,
    package_id  INTEGER NOT NULL REFERENCES package(id),
    version     TEXT NOT NULL,            -- semver
    status      TEXT NOT NULL,
    tag         TEXT,                     -- git tag if published via tag
    published_at TEXT,                    -- tag date / crates.io created_at
    notes       TEXT,                     -- existing changelog notes, if any
    url         TEXT,
    UNIQUE (package_id, version)
);

CREATE TABLE IF NOT EXISTS pull_request (
    id          INTEGER PRIMARY KEY,
    repo_id     INTEGER NOT NULL REFERENCES repo(id),
    number      INTEGER NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT,
    author      TEXT,
    state       TEXT NOT NULL,            -- open|closed|merged
    labels      TEXT,                     -- JSON array of names
    created_at  TEXT,
    merged_at   TEXT,
    url         TEXT,
    -- does this PR bump a version (a "release PR")?
    bumps_version INTEGER NOT NULL DEFAULT 0,
    -- app-repo PRs only: the release this PR shipped in
    release_id  INTEGER REFERENCES release_(id),
    UNIQUE (repo_id, number)
);

-- Dep-repo PRs can ship in several crate releases at once.
CREATE TABLE IF NOT EXISTS release_pr (
    pr_id       INTEGER NOT NULL REFERENCES pull_request(id),
    release_id  INTEGER NOT NULL REFERENCES release_(id),
    UNIQUE (pr_id, release_id)
);

-- What each app release pins each dependency crate to,
-- read from the workspace Cargo.toml at that release's tag (or HEAD).
CREATE TABLE IF NOT EXISTS dependency_pin (
    id              INTEGER PRIMARY KEY,
    release_id      INTEGER NOT NULL REFERENCES release_(id),
    dep_package_id  INTEGER NOT NULL REFERENCES package(id),
    pinned_version  TEXT NOT NULL,
    source_ref      TEXT NOT NULL,        -- tag or "HEAD"
    UNIQUE (release_id, dep_package_id)
);

-- ---------------------------------------------------------------- gold ------

-- Diff of consecutive dependency pins per app release ("bumped X 0.2.1 -> 0.3.0").
CREATE TABLE IF NOT EXISTS dependency_bump (
    id          INTEGER PRIMARY KEY,
    release_id  INTEGER NOT NULL REFERENCES release_(id),
    dep_package_id INTEGER NOT NULL REFERENCES package(id),
    from_version TEXT,
    to_version  TEXT NOT NULL,
    UNIQUE (release_id, dep_package_id)
);

-- Rewrite-ready changelog lines, derived from PR titles/bodies + bumps.
-- kind: feature|fix|deps|other
CREATE TABLE IF NOT EXISTS changelog_entry (
    id          INTEGER PRIMARY KEY,
    release_id  INTEGER NOT NULL REFERENCES release_(id),
    kind        TEXT NOT NULL,
    text        TEXT NOT NULL,
    source_pr_id INTEGER REFERENCES pull_request(id),
    position    INTEGER NOT NULL DEFAULT 0,
    UNIQUE (release_id, kind, position)
);

CREATE INDEX IF NOT EXISTS idx_pr_release   ON pull_request(release_id);
CREATE INDEX IF NOT EXISTS idx_pr_merged    ON pull_request(repo_id, merged_at);
CREATE INDEX IF NOT EXISTS idx_relpr_pr     ON release_pr(pr_id);
CREATE INDEX IF NOT EXISTS idx_relpr_rel    ON release_pr(release_id);
CREATE INDEX IF NOT EXISTS idx_pin_release  ON dependency_pin(release_id);
CREATE INDEX IF NOT EXISTS idx_raw_lookup   ON raw_payload(kind, repo, identifier);

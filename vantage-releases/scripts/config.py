"""Pipeline configuration: source repos and the crates we track.

Override the owner without editing this file:  export GITHUB_OWNER=my-org
"""



# ---------------------------------------------------------------- sources ---

# GitHub repos we collect from. kind: 'app' publishes the application;
# 'deps' is the monorepo the vantage-* dependency crates publish from.
APP_REPO = {"owner": "atk4", "name": "vantage-ui", "kind": "app"}
DEPS_REPO = {"owner": "romaninsh", "name": "vantage", "kind": "deps"}

SOURCE_REPOS = [APP_REPO, DEPS_REPO]

# Where in the app repo the version-carrying Cargo.toml lives, and where the
# dependency pins live (workspace root).
APP_CARGO_PATH = "crates/app/Cargo.toml"
PINS_CARGO_PATH = "Cargo.toml"

# ---------------------------------------------------------------- crates ----

# The app crate + the vantage dependency crates published from DEPS_REPO.
# Add names here as new dependencies appear in the workspace Cargo.toml.
APP_CRATE = "vantage-ui"
DEPENDENCY_CRATES = [
    "vantage-core",
    "vantage-types",
    "vantage-expressions",
    "vantage-dataset",
    "vantage-action",
    "vantage-bundle",
    "vantage-table",
    "vantage-sql",
    "vantage-surrealdb",
    "vantage-mongodb",
    "vantage-api-client",
    "vantage-aws",
    "vantage-kubernetes",
    "vantage-cmd",
    "surreal-client",
    "vantage-vista",
    "vantage-vista-factory",
    "vantage-diorama",
    "vantage-diorama-aggregate",
    "vantage-csv",
    "vantage-faker",
]


def packages() -> list[dict]:
    """Normalized package list: kind 'app' for the app crate, else 'dependency'."""
    out = [{"repo": APP_REPO, "name": APP_CRATE, "kind": "app"}]
    for c in DEPENDENCY_CRATES:
        out.append({"repo": DEPS_REPO, "name": c, "kind": "dependency"})
    return out


def repo_full(repo: dict) -> str:
    return f"{repo['owner']}/{repo['name']}"

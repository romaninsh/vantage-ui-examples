//! Driver binary: the "custom app driving execution of integration tests".
//!
//! For each selected app under `apps/`, it points the World at that app's
//! `inventory/` and runs cucumber over (a) the framework's shared common
//! features and (b) the app's own `tests/` scenarios. Failures across all
//! apps are aggregated into a single non-zero exit code.
//!
//! Usage:
//!   vantage-ui-test apps/bakery [apps/other ...]
//!   vantage-ui-test --all          # every dir under apps/

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use cucumber::{writer::Stats, World};

use test_framework::world::{VantageWorld, INVENTORY_ENV};

// Step definitions are compiled into this binary (see the note in lib.rs).
mod steps;

/// Shared scenarios applied to every app (e.g. the startup check).
const COMMON_FEATURES: &str = "test-framework/features/common";
/// Where `--all` looks for apps.
const APPS_DIR: &str = "apps";

#[tokio::main(flavor = "multi_thread")]
async fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();

    let apps = match resolve_apps(&args) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("error: {e}");
            return ExitCode::FAILURE;
        }
    };
    if apps.is_empty() {
        eprintln!("usage: vantage-ui-test <app-dir>... | --all");
        return ExitCode::FAILURE;
    }

    let mut any_failed = false;
    for app in &apps {
        let inventory = app.join("inventory");
        if !inventory.is_dir() {
            eprintln!("skipping {}: no inventory/ folder", app.display());
            any_failed = true;
            continue;
        }

        println!("\n=== app: {} ===", app.display());
        // The launch step reads the inventory from this env var. Safe here:
        // apps run sequentially and scenarios are not concurrent.
        std::env::set_var(INVENTORY_ENV, &inventory);

        // Run the shared common features, then any app-specific ones.
        let mut feature_dirs: Vec<PathBuf> = vec![PathBuf::from(COMMON_FEATURES)];
        let app_tests = app.join("tests");
        if has_features(&app_tests) {
            feature_dirs.push(app_tests);
        }

        for dir in feature_dirs {
            println!("--- features: {} ---", dir.display());
            let writer = VantageWorld::cucumber()
                .max_concurrent_scenarios(1)
                .fail_on_skipped()
                .with_default_cli()
                .filter_run(dir, |feat, _rule, sc| {
                    !feat.tags.iter().chain(sc.tags.iter()).any(|t| t == "wip")
                })
                .await;
            if writer.execution_has_failed() {
                any_failed = true;
            }
        }
    }

    if any_failed {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    }
}

/// Turn CLI args into a list of app directories. `--all` scans `apps/`.
fn resolve_apps(args: &[String]) -> anyhow::Result<Vec<PathBuf>> {
    if args.iter().any(|a| a == "--all") {
        let mut apps: Vec<PathBuf> = std::fs::read_dir(APPS_DIR)
            .map_err(|e| anyhow::anyhow!("read {APPS_DIR}/: {e}"))?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .filter(|p| {
                // An app opts out of the `--all` sweep with a `.bdd-skip` file —
                // e.g. it needs external infra a CI runner can't provide (the
                // file's contents, if any, are printed as the reason). It still
                // runs when named explicitly: `vantage-ui-test apps/<name>`.
                let marker = p.join(".bdd-skip");
                if marker.is_file() {
                    let reason = std::fs::read_to_string(&marker).unwrap_or_default();
                    let reason = reason.trim();
                    let reason = if reason.is_empty() { ".bdd-skip present" } else { reason };
                    eprintln!("skipping {} (--all): {reason}", p.display());
                    false
                } else {
                    true
                }
            })
            .collect();
        apps.sort();
        Ok(apps)
    } else {
        Ok(args.iter().map(PathBuf::from).collect())
    }
}

/// `true` if `dir` exists and contains at least one `.feature` file.
fn has_features(dir: &Path) -> bool {
    std::fs::read_dir(dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .any(|e| e.path().extension().is_some_and(|x| x == "feature"))
        })
        .unwrap_or(false)
}

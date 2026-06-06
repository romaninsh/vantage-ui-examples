//! Steps for the shared startup scenario. These are reused by every app —
//! the inventory under test comes from `$VANTAGE_APP_INVENTORY`, set by the
//! driver before each app's run.

use std::time::Duration;

use cucumber::{given, then, when};

use test_framework::world::VantageWorld;

const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);

#[given("the vantage-ui app is launched")]
async fn launch(w: &mut VantageWorld) {
    let inventory = VantageWorld::inventory_from_env();
    w.launch_and_wait(&inventory, STARTUP_TIMEOUT).await;
}

#[when("the app has finished starting up")]
async fn started(w: &mut VantageWorld) {
    assert!(w.mcp.is_some(), "app did not reach a ready state");
}

#[then("there are no error log entries")]
async fn no_errors(w: &mut VantageWorld) {
    let errors = w.errors().await;
    assert!(
        errors.is_empty(),
        "expected zero ERROR log entries, got {}:\n{}",
        errors.len(),
        errors
            .iter()
            .map(|e| format!("  [{}] {}: {}", e.level, e.target, e.message))
            .collect::<Vec<_>>()
            .join("\n"),
    );
}

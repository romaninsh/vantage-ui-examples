//! Steps for the MCP data tools (`list_models`, `run_data_script`).
//!
//! The Rhai is the step text itself (captured by a regex), so each scenario
//! line reads as the exact query an agent would run — printed inline in the
//! cucumber output. Positive checks are self-asserting Rhai expressions that
//! must evaluate to `true`. Results are deterministic because the app runs
//! against the in-process `fake_rest` backend.

use std::time::Duration;

use cucumber::{then, when};

use test_framework::world::VantageWorld;

const DATA_READY_TIMEOUT: Duration = Duration::from_secs(30);
/// Generous row cap for `list()` in tests — fixtures are tiny.
const TEST_LIMIT: u32 = 50;

#[when("the data tools are ready")]
async fn data_ready(w: &mut VantageWorld) {
    w.wait_for_data_tools(DATA_READY_TIMEOUT).await;
}

#[then(expr = "the model list includes {string}")]
async fn model_list_includes(w: &mut VantageWorld, name: String) {
    let models = w.models().await;
    assert!(
        models.iter().any(|m| m.name == name),
        "expected model `{name}` in list_models; got: {:?}",
        models.iter().map(|m| &m.name).collect::<Vec<_>>()
    );
}

/// `Then the data script holds: <rhai>` — the trailing Rhai (rest of the line)
/// is run in direct mode and must evaluate to `true`, e.g.
/// `the data script holds: table("launches").count() == 5`.
#[then(regex = r"^the data script holds: (.+)$")]
async fn data_script_holds(w: &mut VantageWorld, script: String) {
    w.run_script(&script, "direct", Some(TEST_LIMIT)).await;
    if let Some(e) = &w.last_error {
        panic!("data script errored:\n  {script}\n  --> {e}");
    }
    let v = w.last.as_ref().expect("no result recorded");
    assert_eq!(
        v,
        &serde_json::Value::Bool(true),
        "expected the assertion to hold (true), got {v}:\n  {script}"
    );
}

/// `When the cache-mode data script fails: <rhai>` — run the trailing Rhai in
/// cache mode and require it to fail (records the error for the following
/// `the error mentions ...` step).
#[when(regex = r"^the cache-mode data script fails: (.+)$")]
async fn cache_script_fails(w: &mut VantageWorld, script: String) {
    w.run_script(&script, "cache", Some(TEST_LIMIT)).await;
    assert!(
        w.last_error.is_some(),
        "expected the cache-mode script to fail, but it returned: {:?}\n  {script}",
        w.last
    );
}

#[then(expr = "the error mentions {string}")]
async fn error_mentions(w: &mut VantageWorld, fragment: String) {
    let err = w.last_error.as_ref().expect("no error recorded");
    assert!(
        err.contains(&fragment),
        "error did not mention `{fragment}`; was: {err}"
    );
}

//! The cucumber [`World`]: one fresh instance per scenario. It owns the
//! spawned app process and the MCP connection, and provides the readiness
//! and assertion helpers the steps call.

use std::time::{Duration, Instant};

use cucumber::World;

use crate::fake_rest;
use crate::launch_control;
use crate::launcher::{self, AppProcess};
use crate::mcp_client::{DataModel, LogEntry, McpClient};

/// Env var the driver sets per-app; the launch step reads the inventory
/// path from here so the shared gherkin step needs no path argument.
pub const INVENTORY_ENV: &str = "VANTAGE_APP_INVENTORY";

#[derive(World)]
#[world(init = Self::new)]
pub struct VantageWorld {
    pub app: Option<AppProcess>,
    pub mcp: Option<McpClient>,
    /// Last successful `run_data_script` result (the `Then` steps assert on it).
    pub last: Option<serde_json::Value>,
    /// Last `run_data_script` error message (for the "fails with" steps).
    pub last_error: Option<String>,
}

impl std::fmt::Debug for VantageWorld {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("VantageWorld")
            .field("app_spawned", &self.app.is_some())
            .field("mcp_connected", &self.mcp.is_some())
            .finish()
    }
}

impl VantageWorld {
    async fn new() -> Self {
        // Bring up the canned LL2 backend before any app launches, so the
        // mock app's datasources resolve and the shared startup scenario's
        // "no errors" check passes. Idempotent across scenarios.
        fake_rest::ensure_started().await;
        // launch-control is the one app with a real bundled REST server it
        // can't run without; build/seed/serve it (only for that app, to avoid
        // a needless build + port bind for everyone else).
        if Self::inventory_is_launch_control() {
            launch_control::ensure_started().await;
        }
        Self {
            app: None,
            mcp: None,
            last: None,
            last_error: None,
        }
    }

    fn mcp(&self) -> &McpClient {
        self.mcp.as_ref().expect("mcp not connected")
    }

    /// Poll `list_models` until it reports at least one model (the catalog's
    /// resolver is published when the first page builds, slightly after the
    /// catalog folders load) — or panic after `timeout`.
    pub async fn wait_for_data_tools(&self, timeout: Duration) {
        let deadline = Instant::now() + timeout;
        loop {
            if let Ok(models) = self.mcp().list_models().await {
                if !models.is_empty() {
                    return;
                }
            }
            if Instant::now() >= deadline {
                panic!("data tools not ready (list_models stayed empty) within {timeout:?}");
            }
            tokio::time::sleep(Duration::from_millis(150)).await;
        }
    }

    pub async fn models(&self) -> Vec<DataModel> {
        self.mcp().list_models().await.expect("list_models")
    }

    /// Run a data script, recording the result in `last` (on success) or the
    /// error text in `last_error` (on failure). Both are cleared first.
    pub async fn run_script(&mut self, script: &str, mode: &str, limit: Option<u32>) {
        self.last = None;
        self.last_error = None;
        match self.mcp().run_data_script(script, mode, limit).await {
            Ok(v) => self.last = Some(v),
            Err(e) => self.last_error = Some(format!("{e:#}")),
        }
    }

    /// `true` when the app the driver selected for this scenario is
    /// launch-control (its inventory path lives under `apps/launch-control`).
    fn inventory_is_launch_control() -> bool {
        std::env::var(INVENTORY_ENV)
            .map(|p| p.contains("launch-control"))
            .unwrap_or(false)
    }

    /// The inventory to launch, taken from `$VANTAGE_APP_INVENTORY`.
    pub fn inventory_from_env() -> String {
        std::env::var(INVENTORY_ENV).unwrap_or_else(|_| {
            panic!("{INVENTORY_ENV} not set — the driver should set it per app")
        })
    }

    /// Spawn the app against `inventory` and block until the MCP server is
    /// reachable AND the catalog has finished loading (all five `catalog
    /// "loaded folder"` lines seen), or panic after `timeout`.
    pub async fn launch_and_wait(&mut self, inventory: &str, timeout: Duration) {
        let app = AppProcess::spawn(inventory).expect("spawn vantage-ui");
        self.app = Some(app);

        let url = launcher::mcp_url();
        let deadline = Instant::now() + timeout;

        // Phase 1: connect — proves the MCP server bound and the initialize
        // handshake succeeded. Fail fast if the child died on startup.
        let client = loop {
            if let Some(a) = self.app.as_mut() {
                assert!(
                    a.is_alive(),
                    "vantage-ui exited before its MCP server came up"
                );
            }
            match McpClient::connect(&url).await {
                Ok(c) => break c,
                Err(e) => {
                    if Instant::now() >= deadline {
                        panic!("MCP server never came up within {timeout:?}: {e:#}");
                    }
                    tokio::time::sleep(Duration::from_millis(150)).await;
                }
            }
        };
        self.mcp = Some(client);

        // Phase 2: poll until the catalog has settled. `Catalog::load`
        // emits one `catalog "loaded folder"` INFO line per kind
        // (datasource/table/page/menu/action) — five total. Seeing all
        // five means loading finished.
        loop {
            if let Some(a) = self.app.as_mut() {
                assert!(a.is_alive(), "vantage-ui exited during catalog load");
            }
            let entries = self
                .mcp
                .as_ref()
                .unwrap()
                .list_logs("info", None, Some(500))
                .await
                .expect("list_logs during readiness poll");
            let loaded_folders = entries
                .iter()
                .filter(|e| e.target == "catalog" && e.message.contains("loaded folder"))
                .count();
            if loaded_folders >= 5 {
                break;
            }
            if Instant::now() >= deadline {
                panic!(
                    "catalog did not settle (saw {loaded_folders}/5 'loaded folder' lines) \
                     within {timeout:?}"
                );
            }
            tokio::time::sleep(Duration::from_millis(150)).await;
        }
    }

    /// All ERROR-level log entries (server-side filtered).
    pub async fn errors(&self) -> Vec<LogEntry> {
        self.mcp
            .as_ref()
            .expect("mcp not connected")
            .list_logs("error", None, Some(500))
            .await
            .expect("list_logs(error)")
    }
}

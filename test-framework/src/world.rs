//! The cucumber [`World`]: one fresh instance per scenario. It owns the
//! spawned app process and the MCP connection, and provides the readiness
//! and assertion helpers the steps call.

use std::time::{Duration, Instant};

use cucumber::World;

use crate::launcher::{self, AppProcess};
use crate::mcp_client::{LogEntry, McpClient};

/// Env var the driver sets per-app; the launch step reads the inventory
/// path from here so the shared gherkin step needs no path argument.
pub const INVENTORY_ENV: &str = "VANTAGE_APP_INVENTORY";

#[derive(World)]
#[world(init = Self::new)]
pub struct VantageWorld {
    pub app: Option<AppProcess>,
    pub mcp: Option<McpClient>,
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
        Self {
            app: None,
            mcp: None,
        }
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

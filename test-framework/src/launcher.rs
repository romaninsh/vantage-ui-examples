//! Spawn and supervise the vantage-ui binary as a child process.
//!
//! Strictly black-box: we only ever start the published binary and talk to
//! it over MCP. The binary path comes from `$VANTAGE_UI_BIN` (CI sets this
//! after downloading the DMG); locally it falls back to a sibling release
//! build of `../vantage-ui`.

use std::path::PathBuf;
use std::process::Stdio;

use anyhow::{bail, Context, Result};
use tokio::process::{Child, Command};

/// Fixed loopback port for the app's embedded MCP server. With
/// `max_concurrent_scenarios(1)` a single fixed port is collision-free;
/// switch to probed free ports if scenarios ever run in parallel
/// (see `todo/ci-hardening.md`).
pub const MCP_PORT: u16 = 14488;

pub fn mcp_addr() -> String {
    format!("127.0.0.1:{MCP_PORT}")
}

pub fn mcp_url() -> String {
    format!("http://127.0.0.1:{MCP_PORT}/mcp")
}

/// Resolve the vantage-ui binary: `$VANTAGE_UI_BIN` if set, else a local
/// sibling release build.
pub fn resolve_binary() -> Result<PathBuf> {
    if let Ok(p) = std::env::var("VANTAGE_UI_BIN") {
        let p = PathBuf::from(p);
        if !p.exists() {
            bail!(
                "VANTAGE_UI_BIN points at a non-existent path: {}",
                p.display()
            );
        }
        return Ok(p);
    }
    let fallback = PathBuf::from("../vantage-ui/target/release/vantage-ui");
    if fallback.exists() {
        return Ok(fallback);
    }
    bail!(
        "no vantage-ui binary found — set VANTAGE_UI_BIN, or build a release \
         binary in ../vantage-ui (cargo build --release)"
    );
}

/// A spawned app process. Killed on `Drop` so a failed scenario never leaks
/// a GUI window or a bound MCP port into the next one.
pub struct AppProcess {
    child: Child,
}

impl AppProcess {
    /// Launch the binary against `inventory`, pointing its MCP server at
    /// our fixed port and forcing `RUST_LOG=info` so the catalog's
    /// readiness lines are captured.
    pub fn spawn(inventory: &str) -> Result<Self> {
        let bin = resolve_binary()?;
        let child = Command::new(&bin)
            .arg(inventory)
            .env("VANTAGE_MCP_ADDR", mcp_addr())
            .env("RUST_LOG", "info")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .with_context(|| format!("spawn {}", bin.display()))?;
        Ok(Self { child })
    }

    /// `true` while the child is still running.
    pub fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

impl Drop for AppProcess {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

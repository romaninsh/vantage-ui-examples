//! Brings up the bundled `launch-control` REST server for that app's scenarios.
//!
//! Unlike `space-mock` (whose backend is the in-process `fake_rest`), the
//! `launch-control` app talks to a *real* sibling crate, `launch-control-server`
//! (`apps/launch-control/server`): an LL2-shaped REST API over a SQLite DB. The
//! app can't load a single row unless that server is running and seeded, so the
//! shared `startup.feature` "no errors" check — and the data-tool scenarios —
//! would fail without it.
//!
//! We start it deterministically (`--error-rate 0`): no injected 503s, so
//! `run_data_script` `direct` reads are stable and startup stays error-free.
//! The DB is gitignored,
//! so we seed it from the committed fixtures first (offline — no `--refetch`).
//!
//! Idempotent and cheap to call from every `World::new`: if something is already
//! listening on the port (a dev server, or a previous scenario), we reuse it.

use std::process::Stdio;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use tokio::net::TcpStream;
use tokio::process::Command;
use tokio::sync::OnceCell;

/// Port the launch-control datasource points at
/// (`apps/launch-control/inventory/datasource/local.yaml`).
pub const PORT: u16 = 8080;

/// Cargo package that builds the bundled server.
const SERVER_PKG: &str = "launch-control-server";
/// Where `cargo build` drops the (debug-profile) binary, relative to the
/// workspace root the harness runs from.
const SERVER_BIN: &str = "target/debug/launch-control-server";

static SERVER: OnceCell<()> = OnceCell::const_new();

/// Ensure the launch-control server is up and seeded, exactly once per process.
///
/// Panics (like the other readiness helpers) if it can't bring the server up —
/// a missing backend is a hard test failure, not something to limp past.
pub async fn ensure_started() {
    SERVER
        .get_or_init(|| async {
            if let Err(e) = start().await {
                panic!("launch-control server failed to start: {e:#}");
            }
        })
        .await;
}

async fn start() -> Result<()> {
    // Already listening (a dev `serve`, or a prior run)? Reuse it — re-seeding
    // under a live connection would be both wasteful and racy.
    if port_open().await {
        eprintln!("launch-control server already up on :{PORT} — reusing it");
        return Ok(());
    }

    // 1. Build the server. `cargo run -p test-framework` has finished building
    //    by the time this executes, so the build lock is free.
    eprintln!("building {SERVER_PKG}…");
    let status = Command::new("cargo")
        .args(["build", "-p", SERVER_PKG])
        .status()
        .await
        .context("cargo build launch-control-server")?;
    if !status.success() {
        bail!("cargo build -p {SERVER_PKG} failed");
    }

    // 2. Seed SQLite from the committed fixtures (offline, idempotent — it
    //    recreates the schema and rows each time).
    eprintln!("seeding launch-control SQLite…");
    let status = Command::new(SERVER_BIN)
        .arg("seed")
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .status()
        .await
        .with_context(|| format!("run {SERVER_BIN} seed"))?;
    if !status.success() {
        bail!("{SERVER_BIN} seed failed");
    }

    // 3. Serve deterministically. Detached: the harness reuses it across
    //    scenarios and the OS reaps it when the test process exits.
    eprintln!("starting launch-control server on :{PORT} (error-rate 0)…");
    Command::new(SERVER_BIN)
        .args([
            "serve",
            "--error-rate",
            "0",
            "--port",
            &PORT.to_string(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .with_context(|| format!("spawn {SERVER_BIN} serve"))?;

    // 4. Wait for it to accept connections.
    let deadline = std::time::Instant::now() + Duration::from_secs(30);
    loop {
        if port_open().await {
            return Ok(());
        }
        if std::time::Instant::now() >= deadline {
            bail!("launch-control server never came up on :{PORT} within 30s");
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}

/// `true` if something is accepting TCP connections on the server port.
async fn port_open() -> bool {
    TcpStream::connect(("127.0.0.1", PORT)).await.is_ok()
}

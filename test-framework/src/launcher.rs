//! Spawn and supervise the vantage-ui binary as a child process.
//!
//! Strictly black-box: we only ever start the published binary and talk to
//! it over MCP. The binary is resolved in order:
//!
//! 1. `$VANTAGE_UI_BIN` — explicit path, no download.
//! 2. `$VANTAGE_UI_VERSION` — download from S3 if not cached (e.g. `0.12.0`
//!    or `latest`), from the `$VANTAGE_UI_CHANNEL` channel ("stable" default,
//!    "main" for nightly). Cached under `~/.cache/vantage-ui/`.
//! 3. Fallback: `../vantage-ui/target/release/vantage-ui`.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use anyhow::{bail, Context, Result};
use tokio::process::{Child, Command};

/// Fixed loopback port for the app's embedded MCP server.
pub const MCP_PORT: u16 = 14488;

/// S3 base URL for release artifacts (the channel is appended).
const S3_BASE: &str = "https://vantage-releases.s3.eu-west-2.amazonaws.com";

/// Release channel to pull from: "stable" (default) or "main" (nightly).
/// The nightly BDD workflow sets this to "main".
fn channel() -> String {
    std::env::var("VANTAGE_UI_CHANNEL").unwrap_or_else(|_| "stable".to_string())
}

/// Local cache directory for extracted binaries.
const CACHE_DIR: &str = ".cache/vantage-ui";

pub fn mcp_addr() -> String {
    format!("127.0.0.1:{MCP_PORT}")
}

pub fn mcp_url() -> String {
    format!("http://127.0.0.1:{MCP_PORT}/mcp")
}

/// Resolve the vantage-ui binary:
pub fn resolve_binary() -> Result<PathBuf> {
    // 1. Explicit path.
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

    // 2. Version → S3 download + cache.
    if let Ok(ver) = std::env::var("VANTAGE_UI_VERSION") {
        return resolve_from_s3(&ver);
    }

    // 3. Local fallback.
    let fallback = PathBuf::from("../vantage-ui/target/release/vantage-ui");
    if fallback.exists() {
        return Ok(fallback);
    }
    bail!(
        "no vantage-ui binary found — set VANTAGE_UI_BIN or VANTAGE_UI_VERSION, \
         or build ../vantage-ui with cargo build --release"
    );
}

/// Resolve a version string to a cached binary, downloading from S3 if needed.
///
/// `ver` can be a specific version like `"0.12.0"` or `"latest"`.
fn resolve_from_s3(ver: &str) -> Result<PathBuf> {
    let cache = cache_dir();
    let chan = channel();

    // For "latest" read the channel manifest, which carries the exact DMG url
    // (so it survives artifact renames). For a pinned version, reconstruct the
    // conventional url.
    let (version, dmg_url) = if ver == "latest" {
        fetch_latest(&chan)?
    } else {
        (
            ver.to_string(),
            format!("{S3_BASE}/{chan}/{ver}/Vantage-{ver}-aarch64.dmg"),
        )
    };

    let version_dir = cache.join(&chan).join(&version);

    // Cache hit: a `*.app` already extracted under the version dir.
    if let Some(bin) = find_app_binary(&version_dir) {
        eprintln!("binary cache hit: {}", bin.display());
        return Ok(bin);
    }

    eprintln!("downloading vantage-ui {version} ({chan}) from {dmg_url}…");
    let dmg_path = version_dir.join("download.dmg");
    std::fs::create_dir_all(&version_dir)?;

    // Download.
    let status = std::process::Command::new("curl")
        .args(["-fsSL", "--progress-bar", &dmg_url, "-o"])
        .arg(&dmg_path)
        .status()
        .context("curl download")?;
    if !status.success() {
        bail!("curl failed for {dmg_url}");
    }

    // Mount.
    let output = std::process::Command::new("hdiutil")
        .args([
            "attach",
            &dmg_path.to_string_lossy(),
            "-nobrowse",
            "-readonly",
        ])
        .output()
        .context("hdiutil attach")?;
    if !output.status.success() {
        bail!(
            "hdiutil attach failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mount = stdout
        .lines()
        .last()
        .and_then(|l| l.split('\t').next_back())
        .context("parse hdiutil output")?
        .to_string();

    // The bundle name varies across releases ("Vantage.app", older
    // "Vantage Admin.app"), so locate it rather than hardcoding.
    let app_src =
        find_app_bundle(Path::new(&mount)).with_context(|| format!("no .app bundle in {mount}"))?;
    copy_dir_recursive(&app_src.to_string_lossy(), &version_dir)?;

    let _ = std::process::Command::new("hdiutil")
        .args(["detach", &mount])
        .status();
    let _ = std::fs::remove_file(&dmg_path);

    find_app_binary(&version_dir).context("vantage-ui binary missing after extraction")
}

/// Find a `*.app` bundle directly inside `dir`.
fn find_app_bundle(dir: &Path) -> Option<PathBuf> {
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| p.extension().map(|x| x == "app").unwrap_or(false))
}

/// Find the vantage-ui binary inside any `*.app` under `dir`.
fn find_app_binary(dir: &Path) -> Option<PathBuf> {
    let bin = find_app_bundle(dir)?.join("Contents/MacOS/vantage-ui");
    bin.exists().then_some(bin)
}

/// Read `<channel>/latest.json` -> (version, dmg url).
fn fetch_latest(chan: &str) -> Result<(String, String)> {
    let url = format!("{S3_BASE}/{chan}/latest.json");
    let output = std::process::Command::new("curl")
        .args(["-fsSL", &url])
        .output()
        .context("curl latest.json")?;
    if !output.status.success() {
        bail!("failed to fetch {url}");
    }
    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).context("parse latest.json")?;
    let version = json["version"]
        .as_str()
        .context("latest.json missing 'version' field")?
        .to_string();
    let dmg = json["url"]
        .as_str()
        .context("latest.json missing 'url' field")?
        .to_string();
    Ok((version, dmg))
}

fn cache_dir() -> PathBuf {
    dirs_home().join(CACHE_DIR)
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn copy_dir_recursive(src: &str, dst: &Path) -> Result<()> {
    let status = std::process::Command::new("cp")
        .args(["-R", src])
        .arg(dst)
        .status()
        .context("cp -R app bundle")?;
    if !status.success() {
        bail!("cp -R {} {} failed", src, dst.display());
    }
    // Strip quarantine/provenance xattrs so macOS doesn't block the binary.
    let _ = std::process::Command::new("xattr")
        .args(["-cr"])
        .arg(dst)
        .status();
    Ok(())
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

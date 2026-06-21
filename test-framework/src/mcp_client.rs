//! Thin client over the vantage-ui MCP server (`rmcp` 1.7, streamable-HTTP).
//!
//! The only tool the app exposes today is `list_logs`, so that's all we wrap.
//! We reuse rmcp's own client transport rather than hand-rolling JSON-RPC/SSE
//! — it speaks the exact wire protocol the server uses, including the
//! `initialize` handshake and session continuity.

use anyhow::{anyhow, Context, Result};
use rmcp::{model::CallToolRequestParams, transport::StreamableHttpClientTransport, ServiceExt};
use serde::Deserialize;

/// One log line captured by the running app's in-memory ring buffer.
/// Mirrors `LogEntryDto` in `vantage-ui/crates/app/src/mcp/tools.rs`.
#[derive(Debug, Clone, Deserialize)]
pub struct LogEntry {
    pub seq: u64,
    pub timestamp: String,
    /// Uppercase tracing level: `ERROR` | `WARN` | `INFO`.
    pub level: String,
    pub target: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct ListLogsResponse {
    #[allow(dead_code)]
    seq: u64,
    entries: Vec<LogEntry>,
}

/// One catalog model as returned by `list_models`. Mirrors `ModelDto` in
/// `vantage-ui/crates/app/src/mcp/tools.rs`.
#[derive(Debug, Clone, Deserialize)]
pub struct DataModel {
    pub name: String,
    pub datasource: String,
}

#[derive(Debug, Deserialize)]
struct ListModelsResponse {
    models: Vec<DataModel>,
}

#[derive(Debug, Deserialize)]
struct RunDataScriptResponse {
    result: serde_json::Value,
}

/// A connected MCP peer. Constructing it performs the `initialize`
/// handshake, so a successful [`McpClient::connect`] proves the server is
/// bound and reachable.
pub struct McpClient {
    peer: rmcp::service::RunningService<rmcp::RoleClient, ()>,
}

impl McpClient {
    /// Connect to `url` (e.g. `http://127.0.0.1:14488/mcp`) and run the
    /// MCP initialize handshake.
    pub async fn connect(url: &str) -> Result<Self> {
        let transport = StreamableHttpClientTransport::from_uri(url);
        // `()` is the minimal client handler; `serve` runs `initialize`.
        let peer = ().serve(transport).await.context("MCP initialize handshake failed")?;
        Ok(Self { peer })
    }

    /// Call `list_logs`. `level` is the minimum level: `"info"` (INFO+WARN+
    /// ERROR), `"warn"` (WARN+ERROR), or `"error"` (ERROR only) — filtering
    /// happens server-side, so the returned entries are already at-or-above
    /// `level`.
    pub async fn list_logs(
        &self,
        level: &str,
        since_seq: Option<u64>,
        limit: Option<u32>,
    ) -> Result<Vec<LogEntry>> {
        let mut args = serde_json::Map::new();
        args.insert("level".into(), serde_json::Value::String(level.into()));
        if let Some(s) = since_seq {
            args.insert("since_seq".into(), s.into());
        }
        if let Some(l) = limit {
            args.insert("limit".into(), l.into());
        }

        let mut params = CallToolRequestParams::new("list_logs");
        params.arguments = Some(args);
        let result = self
            .peer
            .call_tool(params)
            .await
            .context("call_tool list_logs failed")?;

        let value = result
            .structured_content
            .ok_or_else(|| anyhow!("list_logs returned no structured content"))?;
        let parsed: ListLogsResponse =
            serde_json::from_value(value).context("decode ListLogsResponse")?;
        Ok(parsed.entries)
    }

    /// Call `list_models` — the catalog's models with their datasource.
    pub async fn list_models(&self) -> Result<Vec<DataModel>> {
        let params = CallToolRequestParams::new("list_models");
        let result = self
            .peer
            .call_tool(params)
            .await
            .context("call_tool list_models failed")?;
        let value = result
            .structured_content
            .ok_or_else(|| anyhow!("list_models returned no structured content"))?;
        let parsed: ListModelsResponse =
            serde_json::from_value(value).context("decode ListModelsResponse")?;
        Ok(parsed.models)
    }

    /// Call `run_data_script` and return the script's result value. `mode` is
    /// `"direct"` or `"cache"`. A tool/runtime error (disabled access, unknown
    /// model, Rhai failure) surfaces as `Err` — the caller can assert on it.
    pub async fn run_data_script(
        &self,
        script: &str,
        mode: &str,
        limit: Option<u32>,
    ) -> Result<serde_json::Value> {
        let mut args = serde_json::Map::new();
        args.insert("script".into(), serde_json::Value::String(script.into()));
        args.insert("mode".into(), serde_json::Value::String(mode.into()));
        if let Some(l) = limit {
            args.insert("limit".into(), l.into());
        }

        let mut params = CallToolRequestParams::new("run_data_script");
        params.arguments = Some(args);
        // A JSON-RPC error response (our McpError path) becomes `Err` here,
        // carrying the message — exactly what the "fails with" steps assert on.
        let result = self
            .peer
            .call_tool(params)
            .await
            .context("run_data_script")?;

        let value = result
            .structured_content
            .ok_or_else(|| anyhow!("run_data_script returned no structured content"))?;
        let parsed: RunDataScriptResponse =
            serde_json::from_value(value).context("decode RunDataScriptResponse")?;
        Ok(parsed.result)
    }
}

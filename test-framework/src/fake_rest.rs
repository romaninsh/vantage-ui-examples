//! A tiny canned-fixture REST server standing in for Launch Library 2.
//!
//! The black-box tests must not hit the real `lldev.thespacedevs.com` (flaky,
//! rate-limited, and its data drifts). Instead `apps/space-mock`'s datasources
//! point at `http://127.0.0.1:{PORT}` and this server returns deterministic
//! LL2-shaped envelopes (`{ "count": N, "results": [...] }`) with `?offset=&
//! limit=` paging and the `?lsp__id=` filter the agencies→launches drill-down
//! uses. The `payload_flights` join is returned in full (the `ll2c` datasource
//! filters it in memory on `launch.id`, mirroring the real dev API which
//! ignores that join filter).
//!
//! Hand-rolled over `tokio::net` (GET-only, one request per connection) to keep
//! the framework dependency-light. Started once per process via a `OnceCell`
//! so it's already up before the first app launch — including the shared
//! startup scenario, whose "no errors" check would otherwise fail when the
//! launches page tries to fetch.

use std::collections::HashMap;

use anyhow::Result;
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::OnceCell;

/// Fixed loopback port the mock datasources point at (see
/// `apps/space-mock/inventory/datasource/*.yaml`).
pub const PORT: u16 = 14599;

static SERVER: OnceCell<()> = OnceCell::const_new();

/// Start the fake REST server exactly once per process. Idempotent and cheap
/// to call from every `World::new`.
pub async fn ensure_started() {
    SERVER
        .get_or_init(|| async {
            let listener = TcpListener::bind(("127.0.0.1", PORT))
                .await
                .unwrap_or_else(|e| panic!("fake REST bind 127.0.0.1:{PORT}: {e}"));
            tokio::spawn(async move {
                loop {
                    if let Ok((stream, _)) = listener.accept().await {
                        tokio::spawn(async move {
                            let _ = serve_one(stream).await;
                        });
                    }
                }
            });
        })
        .await;
}

/// Read one HTTP/1.1 GET request, route it, and write the response.
async fn serve_one(mut stream: TcpStream) -> Result<()> {
    // Read until the end of headers; GET requests carry no body.
    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    loop {
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
        if buf.len() > 64 * 1024 {
            break;
        }
    }

    let head = String::from_utf8_lossy(&buf);
    let target = head
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .unwrap_or("/");
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    let params = parse_query(query);

    let body = route(path, &params).to_string();
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    stream.write_all(resp.as_bytes()).await?;
    stream.shutdown().await?;
    Ok(())
}

fn parse_query(q: &str) -> HashMap<String, String> {
    q.split('&')
        .filter(|s| !s.is_empty())
        .filter_map(|kv| kv.split_once('='))
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

/// Route by endpoint path (ignoring the embedded `?mode=detailed`), applying
/// the `{count, results}` envelope with `offset`/`limit` paging.
fn route(path: &str, params: &HashMap<String, String>) -> Value {
    let p = path.trim_end_matches('/');
    let rows: Vec<Value> = match p {
        "/launches" => filter_launches(params),
        "/agencies" => agencies(),
        "/payloads" => payloads(),
        // The join is returned whole; `ll2c` (client filter) narrows it
        // in memory on the row's nested `launch.id`.
        "/payload_flights" => payload_flights(),
        _ => vec![],
    };
    envelope(rows, params)
}

/// Apply `offset`/`limit` paging and wrap in the LL2 envelope. `count` is the
/// pre-paging total so the lazy grid can size its scrollbar.
fn envelope(rows: Vec<Value>, params: &HashMap<String, String>) -> Value {
    let total = rows.len();
    let offset: usize = params.get("offset").and_then(|s| s.parse().ok()).unwrap_or(0);
    let limit: usize = params
        .get("limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(1000);
    let page: Vec<Value> = rows.into_iter().skip(offset).take(limit).collect();
    json!({ "count": total, "next": Value::Null, "previous": Value::Null, "results": page })
}

// ---- fixtures -------------------------------------------------------------

/// 5 launches across 2 providers (lsp 1 → l1,l2 ; lsp 2 → l3,l4,l5).
fn launches() -> Vec<Value> {
    let mk = |id: &str, name: &str, lsp: i64| {
        json!({
            "id": id,
            "name": name,
            "status": { "name": "Go" },
            "launch_service_provider": { "id": lsp, "name": format!("Agency {lsp}") },
            "rocket": { "configuration": { "id": 17, "name": "Falcon 9" } },
            "pad": { "id": 22, "name": "SLC-40" }
        })
    };
    vec![
        mk("l1", "Falcon 9 | Starlink A", 1),
        mk("l2", "Falcon 9 | Starlink B", 1),
        mk("l3", "Long March | Shijian", 2),
        mk("l4", "Long March | Yaogan", 2),
        mk("l5", "Long March | Gaofen", 2),
    ]
}

/// Honor the agencies→launches drill-down filter (`?lsp__id=`).
fn filter_launches(params: &HashMap<String, String>) -> Vec<Value> {
    let all = launches();
    match params.get("lsp__id") {
        Some(want) => all
            .into_iter()
            .filter(|r| {
                r["launch_service_provider"]["id"]
                    .as_i64()
                    .map(|n| n.to_string())
                    == Some(want.clone())
            })
            .collect(),
        None => all,
    }
}

fn agencies() -> Vec<Value> {
    vec![
        json!({ "id": "1", "name": "Agency One", "type": { "name": "Commercial" } }),
        json!({ "id": "2", "name": "Agency Two", "type": { "name": "Government" } }),
    ]
}

fn payloads() -> Vec<Value> {
    vec![
        json!({ "id": "p1", "name": "Starlink A", "type": { "name": "Communications" } }),
        json!({ "id": "p2", "name": "Starlink B", "type": { "name": "Communications" } }),
        json!({ "id": "p3", "name": "Shijian-23", "type": { "name": "Government" } }),
    ]
}

/// 3 payload flights: l1 carries 2 (f1,f2), l3 carries 1 (f3).
fn payload_flights() -> Vec<Value> {
    let mk = |id: &str, launch: &str, payload: &str| {
        json!({
            "id": id,
            "launch": { "id": launch, "name": "Launch" },
            "payload": { "name": payload, "type": { "name": "Communications" } },
            "destination": "LEO",
            "amount": 1
        })
    };
    vec![
        mk("f1", "l1", "Starlink A"),
        mk("f2", "l1", "Starlink B"),
        mk("f3", "l3", "Shijian-23"),
    ]
}

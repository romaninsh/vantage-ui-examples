//! Deliberate unreliability. Every request is delayed by a random latency and,
//! with probability `error_rate`, answered with `503` instead of being served.
//!
//! This is the whole point of the demo as a test harness: it forces the UI's
//! lazy-loading + auto-refresh path to cope with slow and failing responses
//! (the non-blanking refresh in vantage-diorama 0.6.3, retry/error toasts,
//! etc.) deterministically and with no external dependency.

use std::time::Duration;

use axum::{
    Json,
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use rand::Rng;
use serde_json::json;

use crate::rest::AppState;

#[derive(Clone, Copy)]
pub struct FlakyConfig {
    /// Probability in `[0, 1]` that a request is failed with `503`.
    pub error_rate: f64,
    pub latency_min_ms: u64,
    pub latency_max_ms: u64,
}

/// Axum middleware: sleep a random latency, then maybe fail the request.
pub async fn middleware(State(state): State<AppState>, req: Request, next: Next) -> Response {
    let cfg = state.flaky;

    // Draw both random decisions up front so the RNG is dropped before any await
    // (thread_rng is not Send across await points).
    let (delay_ms, fail) = {
        let mut rng = rand::thread_rng();
        let delay = if cfg.latency_max_ms > cfg.latency_min_ms {
            rng.gen_range(cfg.latency_min_ms..=cfg.latency_max_ms)
        } else {
            cfg.latency_min_ms
        };
        (delay, rng.gen_bool(cfg.error_rate.clamp(0.0, 1.0)))
    };

    if delay_ms > 0 {
        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
    }
    if fail {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "detail": "injected flaky failure (tune with --error-rate)" })),
        )
            .into_response();
    }
    next.run(req).await
}

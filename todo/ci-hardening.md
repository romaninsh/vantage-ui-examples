# CI hardening

Out-of-scope-but-needed improvements once the basic suite is green.

- **GUI on CI (highest risk).** vantage-ui (gpui) always opens a window; there
  is no headless mode. The catalog loads on the gpui app thread, so if window /
  Metal init fails on the runner, the readiness poll times out. Validate the
  workflow via `workflow_dispatch` before making it a required check. If it's
  flaky, ask the vantage-ui team for an off-screen / load-only startup mode.
- **Free-port discovery + parallel scenarios.** Today we use a fixed MCP port
  (14488) and `max_concurrent_scenarios(1)`. To parallelize, probe a free port
  per scenario and thread it through `VANTAGE_MCP_ADDR` + the MCP URL.
- **Private S3 fallback.** The workflow assumes the release bucket/objects are
  public-read (plain `curl`). If they're private, add
  `aws-actions/configure-aws-credentials` (OIDC) before the download step.
- **Channel selection.** The workflow pulls `main/latest.json` (nightly). Add a
  matrix / input to also test `stable/latest.json`.
- **Graceful shutdown.** We currently kill the child on `Drop`. Consider an
  explicit teardown that lets the app flush/exit cleanly, and surface the
  child's stderr on failure for easier debugging.
- **Readiness via paging.** The readiness poll reads the last 500 log lines. If
  startup ever gets chatty enough to evict the catalog lines, switch to
  `since_seq` paging and accumulate.

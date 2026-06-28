# Lambda container image for the launch-control demo server — a single,
# statically-linked (arm64 musl) binary on `scratch`. There is no build stage
# here: CI compiles the binary on the runner (reusing the shared
# Swatinem/rust-cache, the same cache every other pipeline uses) and this image
# just packages it. The result is a tiny image with no OS userland.
#
# The binary is built `--no-default-features --features pg,lambda`:
#   - `lambda`: speaks the AWS Lambda Runtime API directly (lambda_http) — no
#     Lambda Web Adapter extension, no listening socket, faster cold start.
#   - `pg` (no `sqlite`): PostgreSQL-only — no SQLite, no libsqlite3-sys. Reads
#     DATABASE_URL from the Lambda env (injected by vantage-terraform/rds.tf).
#     sqlx + reqwest both link rustls with webpki roots compiled in, so nothing
#     external (OpenSSL, CA bundle) is needed — hence `scratch` works.
#
# arm64 (Graviton) Lambda — the function is `architectures = ["arm64"]`. Built on
# an x86_64 runner via cargo-zigbuild (zig cross-compiles ring's C). See the
# deploy workflow:
#   cargo zigbuild --release --target aarch64-unknown-linux-musl \
#     --no-default-features --features pg,lambda -p launch-control-server
#   docker build -f apps/launch-control/server/Dockerfile -t launch-control .

FROM scratch

# Static binary, built on the runner. Build context is the repo root.
COPY target/aarch64-unknown-linux-musl/release/launch-control-server /launch-control-server

ENTRYPOINT ["/launch-control-server"]

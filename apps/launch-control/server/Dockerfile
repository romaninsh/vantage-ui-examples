# Lambda container image for the launch-control demo server — a single arm64
# binary on a distroless base. There is no build stage here: CI compiles the
# binary on a native arm64 runner (reusing the shared Swatinem/rust-cache, the
# same cache every other pipeline uses) and this image just packages it.
#
# The binary is built `--no-default-features --features pg,lambda`:
#   - `lambda`: speaks the AWS Lambda Runtime API directly (lambda_http) — no
#     Lambda Web Adapter extension, no listening socket, faster cold start.
#   - `pg` (no `sqlite`): PostgreSQL-only — no SQLite, no libsqlite3-sys. Reads
#     DATABASE_URL from the Lambda env (injected by vantage-terraform/rds.tf).
#     sqlx + reqwest both link rustls (no OpenSSL), with the webpki CA roots
#     compiled in — so the base needs no OpenSSL and no CA bundle.
#
# Base: distroless/cc (glibc + libgcc only, multi-arch → arm64 here). The binary
# is a normal glibc dynamic executable; distroless/cc has exactly what it needs
# and nothing else. arm64 (Graviton) — the function is `architectures=["arm64"]`.
#
#   cargo build --release --no-default-features --features pg,lambda -p launch-control-server
#   docker build -f apps/launch-control/server/Dockerfile -t launch-control .

FROM gcr.io/distroless/cc-debian12

# Built on the runner (native arm64 glibc). Build context is the repo root.
COPY target/release/launch-control-server /launch-control-server

ENTRYPOINT ["/launch-control-server"]

# Lambda container image for the launch-control demo server.
#
# The unmodified axum server is fronted by the AWS Lambda Web Adapter, copied in
# as an external extension: it polls the Lambda Runtime API and forwards each
# invocation to the HTTP server listening on $PORT — so no Lambda-specific code
# is needed.
#
# Backend (the `FEATURES` build arg): empty builds the SQLite image (the default
# everywhere), where the database lives in /tmp (Lambda's only writable disk) and
# is seeded from embedded fixtures on a cold start. `--build-arg FEATURES=pg`
# builds the PostgreSQL image — the deploy workflow passes this; the server then
# reads DATABASE_URL from the Lambda env (injected by vantage-terraform/rds.tf).
#
# Build context is the vantage-ui-examples repo root (so Cargo can see the
# workspace); the server's vantage-* deps come from crates.io.
#
#   docker build -f apps/launch-control/server/Dockerfile -t launch-control .
#   docker build -f apps/launch-control/server/Dockerfile --build-arg FEATURES=pg -t launch-control .

FROM rust:1-bookworm AS builder
WORKDIR /build
COPY . .
# Empty = SQLite (default); `pg` selects the PostgreSQL backend.
ARG FEATURES=""
RUN cargo build --release -p launch-control-server ${FEATURES:+--features "$FEATURES"}

FROM debian:bookworm-slim
# The adapter runs as a Lambda extension and bridges Runtime API ⇄ HTTP.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 /lambda-adapter /opt/extensions/lambda-adapter
# libssl3: reqwest uses native-tls (dynamically linked OpenSSL), so the binary
# needs libssl.so.3 present to start even though `serve` makes no outbound calls.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /build/target/release/launch-control-server /usr/local/bin/launch-control-server

# PORT: where the adapter forwards (LWA convention). LAUNCH_DB_PATH: the writable
# /tmp database. Readiness via TCP so the adapter waits for the port to open
# (after the cold-start seed) rather than probing an HTTP route.
ENV PORT=8080 \
    LAUNCH_DB_PATH=/tmp/launch.sqlite \
    AWS_LWA_READINESS_CHECK_PROTOCOL=tcp

ENTRYPOINT ["/usr/local/bin/launch-control-server"]

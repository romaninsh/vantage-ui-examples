# The launch-control demo server as a local service: built inside Docker, so
# a machine with no Rust toolchain (the Windows target) still gets a working
# backend from "Start" in Vantage's Services panel. `composer.yaml` next to
# the app points at this file.
#
# Two stages. The build stage compiles the default SQLite server on the
# official Rust image. Dependencies are compiled first against a stub main,
# in their own layer, so a change to `src/` or `fixtures/` rebuilds only the
# crate itself; the first build downloads and compiles everything (several
# minutes). Plain layer caching rather than BuildKit cache mounts, because
# the classic builder, still what a colima install without the buildx
# plugin runs, does not support `RUN --mount`.
#
# The runtime stage is distroless/cc: glibc and libgcc, nothing else, which
# is all a rustls + bundled-SQLite binary needs. The LL2 fixtures are
# embedded in the binary at compile time (see `src/seed.rs`), so the image
# carries no data files and seeds an empty database on first start.
#
# Lambda packaging is a different image with a different feature set; see
# `Dockerfile.lambda`.
#
#   docker build -t launch-control-server apps/launch-control/server

FROM rust:1-bookworm AS build
WORKDIR /src

# Dependency layer: the manifest plus a stub crate that exercises every
# dependency without any of the real source.
COPY Cargo.toml ./
RUN mkdir -p src fixtures \
    && echo 'fn main() {}' > src/main.rs \
    && cargo build --release \
    && rm -rf src fixtures

# The crate itself. Touch main.rs so cargo sees it as newer than the stub's
# artefacts, which carry the same path.
COPY src ./src
COPY fixtures ./fixtures
RUN touch src/main.rs \
    && cargo build --release \
    && cp target/release/launch-control-server /launch-control-server

FROM gcr.io/distroless/cc-debian12
COPY --from=build /launch-control-server /launch-control-server
# The database lives on a volume so a rebuilt image keeps the simulated
# launches added since the seed. `serve` reads its knobs from the
# environment when started without a subcommand (PORT, ERROR_RATE,
# LATENCY_MIN_MS, LATENCY_MAX_MS).
ENV LAUNCH_DB_PATH=/data/launch.sqlite
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["/launch-control-server"]

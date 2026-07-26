#!/usr/bin/env bash
#
# Regenerate the client's typed bindings from the module's schema.
#
# `client/src/module_bindings/` is CLIENT code, despite being derived from the
# server: row structs for what this client receives into its cache, typed table
# handles, and reducer call stubs that send `CallReducer` over the wire. Nothing
# in it runs inside the database. It is the same relationship an OpenAPI-generated
# client has to its API — the schema is the contract and both sides derive from it.
#
# It is committed so the client builds with plain `cargo build`, needing neither
# the SpacetimeDB CLI nor Docker. The cost is that it can go stale: **run this
# after any change to `module/src/lib.rs` that touches a table, view or reducer.**
#
# Usage:  ./regenerate-bindings.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
version="v2.7.0-hotfix3"
wasm="module/target/wasm32-unknown-unknown/release/cardroom_module.wasm"

echo "building the module for wasm32…"
(cd "$here/module" && cargo build --target wasm32-unknown-unknown --release)

# `spacetime generate` shells out to `spacetimedb-standalone` to extract the
# schema from the wasm, and the CLI installed via `cargo install` does not bring
# that binary along. The published image has both, so generate in there — which
# also pins the generator to the same version as the server.
echo "generating bindings via the $version image…"
docker run --rm --user root -v "$here:/work" \
    "clockworklabs/spacetime:$version" \
    generate --lang rust \
    --bin-path "/work/$wasm" \
    --out-dir /work/client/src/module_bindings \
    -y

# The container writes as root; hand the files back.
if [ "$(uname)" = "Darwin" ] || [ -n "${SUDO_USER:-}" ]; then
    sudo chown -R "$(id -u):$(id -g)" "$here/client/src/module_bindings" 2>/dev/null || \
        chmod -R u+w "$here/client/src/module_bindings"
fi

# The image has no rustfmt, so format on the way out instead.
cargo fmt -p cardroom-client 2>/dev/null || true

echo "done — review the diff in client/src/module_bindings/"

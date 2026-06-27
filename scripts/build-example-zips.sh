#!/usr/bin/env bash
#
# Build one `<slug>.zip` per example app, for the `vantage://` one-click
# installer. Each archive contains the app's `inventory/` folder, minus the
# bits that are regenerated on open or must never ship:
#
#   .cache/            runtime caches (redb files) — rebuilt on open
#   .agents/           agent skill docs — not part of the runnable project
#   .env               local secrets — NEVER ship; .env.example is kept
#   __pycache__/       Python bytecode from helper scripts
#   *-schema-*.json    JSON schemas — the app rewrites these on open
#   <folder>/README.md scaffolder-written per-folder READMEs
#
# Executable helper scripts under `scripts/` ARE included (the whole point of
# the cmd backend) — `zip` preserves their unix mode, which the installer reads
# to warn the user.
#
# Output: dist/<slug>.zip. Usage: scripts/build-example-zips.sh [outdir]
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out_dir="${1:-$repo_root/dist}"
mkdir -p "$out_dir"
# Absolutize: zip_path is used after `cd "$app_dir"` below, so a relative
# out_dir (e.g. CI's `dist`) would resolve against the wrong directory and
# zip would fail to open the output file (exit 15).
out_dir="$(cd "$out_dir" && pwd)"

excludes=(
    'inventory/.cache/*'
    'inventory/.agents/*'
    'inventory/.env'
    '*/__pycache__/*'
    '*.DS_Store'
    'inventory/**/*-schema-*.json'
    'inventory/datasource/README.md'
    'inventory/table/README.md'
    'inventory/page/README.md'
    'inventory/menu/README.md'
    'inventory/action/README.md'
)

built=0
for app_dir in "$repo_root"/apps/*/; do
    slug="$(basename "$app_dir")"
    [ -d "$app_dir/inventory" ] || continue

    zip_path="$out_dir/$slug.zip"
    rm -f "$zip_path"
    ( cd "$app_dir" && zip -r -X "$zip_path" inventory -x "${excludes[@]}" ) >/dev/null
    echo "built $zip_path"
    built=$((built + 1))
done

echo "done: $built example archive(s) in $out_dir"

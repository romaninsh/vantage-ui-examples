#!/usr/bin/env bash
#
# Build one `<slug>.zip` per example app, for the `vantage://` one-click
# installer.
#
# Two layouts are supported. An app that still keeps its catalog under
# `inventory/` ships that folder; a flattened app — kind directories directly
# under the app root — ships the app folder itself as `<slug>/`. The installer
# finds either, because it searches the extracted tree for the signature
# directories rather than assuming a fixed name.
#
# A flattened app's root is also the repo's folder for it, so the second list
# below drops what only the repository needs: agent briefs, BDD opt-outs,
# scenario folders and any companion Rust crate. Everything the app needs at
# runtime — helper scripts, seed data, CSV inputs — ships.
#
# Either way the archive omits the bits that are regenerated on open or must
# never ship:
#
#   .cache/            runtime caches (redb files) — rebuilt on open
#   .agents/           agent skill docs — not part of the runnable project
#   .env               local secrets — NEVER ship; .env.example is kept
#   __pycache__/       Python bytecode from helper scripts
#   *-schema-*.json    JSON schemas — the app rewrites these on open
#   <folder>/README.md scaffolder-written per-folder READMEs
#   AGENTS.md          skill pointer file — reinstalled on open
#   manifest.yaml      the app's own install record — machine-local
#
# Everything in that second group is also gitignored, so a CI checkout does not
# have it to begin with; the excludes keep a local run producing the same
# archive as CI.
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

# Generated or machine-local, in either layout. The patterns are rooted at
# `*/` so they match under `inventory/` and under `<slug>/` alike.
excludes=(
    '*/.cache/*'
    '*/.agents/*'
    '*/.env'
    '*/__pycache__/*'
    '*.DS_Store'
    '*-schema-*.json'
    '*/AGENTS.md'
    '*/manifest.yaml'
    '*/datasource/README.md'
    '*/table/README.md'
    '*/page/README.md'
    '*/menu/README.md'
    '*/action/README.md'
    '*/view/README.md'
    '*/form/README.md'
)

# Repository furniture, meaningless to someone who installed the app.
flat_only_excludes=(
    '*/features/*'
    '*/tests/*'
    '*/docs/*'
    '*/cluster/*'
    '*/server/*'
    '*/client/*'
    '*/poker/*'
    '*/.bdd-skip'
    '*/Cargo.toml'
)

built=0
for app_dir in "$repo_root"/apps/*/; do
    slug="$(basename "$app_dir")"
    zip_path="$out_dir/$slug.zip"

    if [ -d "$app_dir/inventory" ]; then
        rm -f "$zip_path"
        ( cd "$app_dir" && zip -r -X "$zip_path" inventory -x "${excludes[@]}" ) >/dev/null
    elif [ -d "$app_dir/datasource" ] || [ -d "$app_dir/page" ]; then
        rm -f "$zip_path"
        ( cd "$repo_root/apps" \
            && zip -r -X "$zip_path" "$slug" \
                -x "${excludes[@]}" "${flat_only_excludes[@]}" ) >/dev/null
    else
        continue
    fi

    echo "built $zip_path"
    built=$((built + 1))
done

echo "done: $built example archive(s) in $out_dir"

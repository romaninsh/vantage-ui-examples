#!/bin/bash
set -e

REPO="${2:-romaninsh/vantage-ui}"
WF_ID="$1"

if [ -z "$WF_ID" ]; then
    echo "usage: test-gh-stats.sh <workflow_id> [repo]"
    exit 1
fi

echo "=== $REPO / workflow $WF_ID ==="

# Step 1: analyze — returns the full (cold) build's crate count.
ANALYSIS=$(gh-rust-caching-stats analyze "$WF_ID" "$REPO" 2>/dev/null || true)
if [ -z "$ANALYSIS" ]; then
    echo "no runs / no rust cache"
    exit 0
fi

TOTAL_CRATES=$(echo "$ANALYSIS" | jq -r '.total_crates')
RUN_ID=$(echo "$ANALYSIS" | jq -r '.run_id')
echo "analyze: run_id=$RUN_ID total_crates=$TOTAL_CRATES"

# Step 2: list runs
RUNS=$(gh-rust-caching-stats runs "$WF_ID" "$REPO" 2>/dev/null | jq -r '.[] .run_id' | head -5)
RUN_COUNT=$(echo "$RUNS" | wc -l | tr -d ' ')
echo "listed $RUN_COUNT runs (first 5)"

# Step 3: stats for each run (single log call each, total-crates feeds the pct)
echo ""
printf "%-12s %-10s %-8s %-10s %-12s %-8s %s\n" \
    "run_id" "cache_size" "match" "env_hash" "compile_time" "crates" "effective%"

for RID in $RUNS; do
    STATS=$(gh-rust-caching-stats stats "$RID" "$REPO" \
        --total-crates "$TOTAL_CRATES" 2>/dev/null || true)
    if [ -n "$STATS" ]; then
        printf "%-12s %-10s %-8s %-10s %-12s %-8s %s\n" \
            "$(echo "$STATS" | jq -r '.run_id')" \
            "$(echo "$STATS" | jq -r '.cache_size')" \
            "$(echo "$STATS" | jq -r '.cache_match')" \
            "$(echo "$STATS" | jq -r '.env_hash')" \
            "$(echo "$STATS" | jq -r '.compile_time')" \
            "$(echo "$STATS" | jq -r '.compiled_crates')" \
            "$(echo "$STATS" | jq -r '.cache_effective_pct')"
    fi
done

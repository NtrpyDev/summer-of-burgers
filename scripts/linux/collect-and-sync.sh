#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/usr/bin:/bin:$PATH"
LOG="$ROOT/data/collector-schedule.log"
mkdir -p "$ROOT/data"
{
  echo ""
  echo "============================================================"
  echo "[$(date)] collect-and-sync"
  echo "============================================================"
  if ! collector_output="$(node scripts/collector.cjs 2>&1)"; then
    echo "$collector_output"
    exit 1
  fi
  echo "$collector_output"
  if [[ "${FORCE_SYNC:-}" == "1" ]] || grep -Eq 'Collector finished: .* [1-9][0-9]* imported' <<<"$collector_output"; then
    bash scripts/linux/sync-to-cloudflare.sh
    SKIP_SYNC=1 bash scripts/linux/deploy-pages.sh
  else
    echo "No new imports; skipping Cloudflare sync and Pages deploy. Set FORCE_SYNC=1 to override."
  fi
} >>"$LOG" 2>&1

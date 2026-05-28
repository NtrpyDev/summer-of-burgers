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
  node scripts/collector.cjs
  bash scripts/linux/sync-to-cloudflare.sh
} >>"$LOG" 2>&1

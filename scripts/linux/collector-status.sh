#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

systemctl --user status summer-of-burgers-collector.timer --no-pager 2>/dev/null || echo "Timer not installed — run: bash scripts/linux/install-server.sh"

echo ""
echo "--- Last log lines ---"
if [[ -f "$ROOT/data/collector-schedule.log" ]]; then
  tail -30 "$ROOT/data/collector-schedule.log"
else
  echo "(no log yet)"
fi

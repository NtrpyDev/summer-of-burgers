#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
WRANGLER="./node_modules/.bin/wrangler"
PROJECT="${1:-summer-of-burgers}"

if [[ "${SKIP_SYNC:-}" != "1" ]]; then
  bash "$ROOT/scripts/linux/sync-to-cloudflare.sh"
fi

"$WRANGLER" pages deploy public --project-name "$PROJECT" --commit-dirty=true
echo "Pages deploy finished."

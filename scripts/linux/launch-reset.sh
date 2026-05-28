#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
WRANGLER="./node_modules/.bin/wrangler"
DB="summer-of-burgers"

echo "Resetting production D1 (votes, limits, Elo)..."
"$WRANGLER" d1 execute "$DB" --file migrations/0003_launch_reset.sql --remote --yes
echo "Re-seeding burgers from local archive..."
node scripts/export-d1-sql.cjs
"$WRANGLER" d1 execute "$DB" --file data/seed-burgers.sql --remote --yes
echo "Launch reset done."

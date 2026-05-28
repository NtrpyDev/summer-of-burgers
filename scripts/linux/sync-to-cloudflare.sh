#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(grep -E '^(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)=' "$ROOT/.env" | sed 's/\r$//')
  set +a
fi
WRANGLER="./node_modules/.bin/wrangler"
BUCKET="summer-of-burgers-images"
DB="summer-of-burgers"

if [[ ! -x "$WRANGLER" ]]; then
  echo "wrangler missing — run: npm install && npx wrangler login"
  exit 1
fi

node scripts/smoke-test.cjs
node scripts/generate-share-cards.cjs
node scripts/export-d1-sql.cjs

for dir in originals thumbs fan share; do
  shopt -s nullglob
  for file in "public/images/$dir"/*; do
    key="$dir/$(basename "$file")"
    echo "R2 put $key"
    "$WRANGLER" r2 object put "$BUCKET/$key" --file "$file" --remote
  done
done

"$WRANGLER" d1 execute "$DB" --file migrations/0001_schema.sql --remote --yes
if [[ -f migrations/0002_fan_upload_limits.sql ]]; then
  "$WRANGLER" d1 execute "$DB" --file migrations/0002_fan_upload_limits.sql --remote --yes
fi
"$WRANGLER" d1 execute "$DB" --file data/seed-burgers.sql --remote --yes
echo "Cloudflare sync finished."

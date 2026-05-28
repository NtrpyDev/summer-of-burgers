#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

git add -A
if git diff --cached --quiet; then
  echo "Nothing to sync."
  exit 0
fi
git commit -m "Sync cleaned codebase from deploy"
git push

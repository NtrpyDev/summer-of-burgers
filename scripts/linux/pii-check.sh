#!/usr/bin/env bash
# Scan tracked files for common PII / secrets before git commit.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

fail=0

scan() {
  local label="$1"
  shift
  local hits
  hits=$(git ls-files -z 2>/dev/null | grep -zv 'scripts/linux/pii-check.sh' | xargs -0 grep -nE "$@" 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    echo "FAIL: $label"
    echo "$hits" | head -20
    fail=1
  fi
}

if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  echo "Not a git repo — skip PII scan."
  exit 0
fi

if git diff --cached --name-only | grep -qE '^\.env$'; then
  echo "FAIL: .env is staged — never commit secrets."
  fail=1
fi

scan "home LAN IP" '192\.168\.[0-9]+\.[0-9]+'
scan "hardcoded password in repo" 'password\s*=\s*["\x27][^"\x27]{8,}'
scan "Bearer / API tokens" 'Bearer [A-Za-z0-9%]{30,}|gho_[A-Za-z0-9]+|X_BEARER_TOKEN=[^#\s]{20,}'
scan "private email" '@gmail\.com|@yahoo\.com|@hotmail\.com|@outlook\.com'

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "PII check failed. Fix issues before pushing."
  exit 1
fi

echo "PII check passed."

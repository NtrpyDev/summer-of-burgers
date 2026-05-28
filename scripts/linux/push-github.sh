#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
bash "$ROOT/scripts/linux/pii-check.sh"
bash "$ROOT/scripts/linux/git-sync.sh" "${1:-summer-of-burgers}"

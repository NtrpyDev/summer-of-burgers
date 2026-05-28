#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
REPO_NAME="${1:-summer-of-burgers}"

if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  git init -b main
fi

if ! git config user.email &>/dev/null; then
  login="$(gh api user -q .login 2>/dev/null || echo "user")"
  git config user.name "$login"
  git config user.email "${login}@users.noreply.github.com"
fi

git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit."
  exit 0
fi

git commit -m "Summer of Burgers — gallery, duels, fan burgers, X collector"

if gh auth status &>/dev/null; then
  if ! git remote get-url origin &>/dev/null; then
    gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
  else
    git push -u origin main
  fi
  echo "GitHub: https://github.com/$(gh api user -q .login)/$REPO_NAME"
else
  echo "Run: gh auth login"
  echo "Then: bash scripts/linux/github-push.sh $REPO_NAME"
fi

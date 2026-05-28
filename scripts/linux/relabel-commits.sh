#!/usr/bin/env bash
# Rebuild main so each top-level path has its own commit message on GitHub.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

login="$(gh api user -q .login 2>/dev/null || echo "user")"
git config user.name "$login"
git config user.email "${login}@users.noreply.github.com"

commit_path() {
  local msg="$1"
  shift
  git add "$@"
  if git diff --cached --quiet; then
    echo "skip (empty): $*"
    return 0
  fi
  git commit -m "$msg"
  echo "ok: $msg"
}

git checkout --orphan relabel-main
git rm -rf --cached . 2>/dev/null || true
git clean -fdX 2>/dev/null || true

commit_path "Project overview and how to run the site" README.md
commit_path "npm dependencies and collector scripts" package.json
commit_path "Locked dependency versions for installs" package-lock.json
commit_path "Cloudflare Pages, D1 database, and R2 bucket bindings" wrangler.toml
commit_path "Example env file — copy to .env and add your X API keys" .env.example
commit_path "Ignore secrets, node_modules, and generated images" .gitignore
commit_path "Cloudflare deploy steps and binding checklist" DEPLOY.md
commit_path "D1 schema for burgers, votes, and fan uploads" migrations
commit_path "Pages Functions API — voting, burgers, fan uploads, share cards" functions
commit_path "Front-end site — gallery, duels, fan burgers, leaderboards" public
commit_path "X collector, deploy helpers, and Linux 24/7 timer scripts" scripts
commit_path "Notes on local collector logs and state (files stay on disk only)" data

git branch -M main
git push -f origin main
echo "Done. Each folder now has its own commit message on GitHub."

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "Installing npm packages (first time may take a few minutes)..."
npm install

echo "Installing systemd timer (every 30 minutes)..."
mkdir -p "$HOME/.config/systemd/user"
cat >"$HOME/.config/systemd/user/summer-of-burgers-collector.service" <<EOF
[Unit]
Description=Summer of Burgers — collect tweets and sync to Cloudflare

[Service]
Type=oneshot
WorkingDirectory=$ROOT
ExecStart=$ROOT/scripts/linux/collect-and-sync.sh
EOF

cat >"$HOME/.config/systemd/user/summer-of-burgers-collector.timer" <<EOF
[Unit]
Description=Run Summer of Burgers collector every 30 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=30min
Persistent=true

[Install]
WantedBy=timers.target
EOF

chmod +x "$ROOT"/scripts/linux/*.sh
systemctl --user daemon-reload
systemctl --user enable --now summer-of-burgers-collector.timer
systemctl --user status summer-of-burgers-collector.timer --no-pager || true

if ! "$ROOT/node_modules/.bin/wrangler" whoami &>/dev/null; then
  echo ""
  echo "ONE-TIME: log into Cloudflare on this PC (browser will open or give you a link):"
  echo "  cd $ROOT && npx wrangler login"
  echo ""
fi

echo "Done. Logs: $ROOT/data/collector-schedule.log"

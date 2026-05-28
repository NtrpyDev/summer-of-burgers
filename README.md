# Summer of Burgers Tracker

Unofficial fan archive for Big Cat's Summer of Burgers posts. Gallery, daily burger duels, fan submissions, and an X collector that syncs to Cloudflare.

**Live site:** https://summerofburgers.site

Runs on a **Linux server** (systemd timer).

## Server setup (one time)

On your Linux box (e.g. `~/summer-of-burgers`):

```bash
git clone https://github.com/NtrpyDev/summer-of-burgers.git
cd summer-of-burgers
cp .env.example .env
# Edit .env — add X_BEARER_TOKEN from console.x.com

npm install
npx wrangler login
bash scripts/linux/install-server.sh
```

That installs a **30-minute** systemd user timer. It collects tweets and runs the AI burger check every time, then syncs R2/D1 and deploys Pages only when a new burger imports.

Logs: `data/collector-schedule.log`

## Daily commands

```bash
cd ~/summer-of-burgers

# Manual full run (same as the timer)
bash scripts/linux/collect-and-sync.sh

# Check timer + recent log
bash scripts/linux/collector-status.sh

# Test X API
bash scripts/linux/check-x-api.sh

# One tweet
bash scripts/linux/collector.sh --tweet "https://x.com/BarstoolBigCat/status/PASTE_ID"

# Push code to GitHub (PII scan first)
bash scripts/linux/push-github.sh
```

## How collection works

X does **not** push to your server. The timer **polls** for new `@BarstoolBigCat` image tweets, runs **CLIP vision** to keep burger photos only, then uploads to Cloudflare. Usually within ~30 minutes of a tweet, not instant.

## Privacy

The public site has no owner PII, analytics, submitter names, or emails. Votes use a salted hash of a server-signed browser token (`VOTE_SALT` in Cloudflare), plus hashed per-network daily throttles. Fan upload IPs are hashed, not stored raw.

See [DEPLOY.md](DEPLOY.md) for Cloudflare bindings and `VOTE_SALT`.

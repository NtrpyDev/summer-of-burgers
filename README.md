# Summer of Burgers Tracker

Unofficial fan archive for Big Cat's Summer of Burgers posts. The app includes a newest-first searchable gallery, a daily head-to-head burger vote, and a separate fan burger submission/voting lane.

## What Is Included

- Cloudflare Pages-ready static site in `public/`
- Pages Functions API in `functions/api/`
- D1 schema in `migrations/0001_schema.sql`
- Local X collector in `scripts/collector.cjs`
- Local dev server in `scripts/dev-server.cjs`
- Optional Windows scheduled task installer in `scripts/install-scheduled-task.ps1`
- Anonymous browser voting limits backed by D1
- Fan burger upload API backed by R2 and D1
- Vote-specific share pages with Twitter Card images in `public/images/share/`

The public site does not include personal owner details, personal domains, public analytics tags, submitter names, or submitter emails.

## Local Commands

This machine's normal `node` command may not be available. Use the bundled Node runtime:

```powershell
$Node = Join-Path $HOME ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
& $Node scripts\smoke-test.cjs
& $Node scripts\dev-server.cjs
```

Then open:

```text
http://localhost:8788
```

## Collector Setup

The live site does **not** watch X by itself. New Big Cat tweets are pulled on **your PC** via the **X API**, then pushed to Cloudflare with sync.

1. Copy `.env.example` to `.env`
2. Paste your **Bearer Token** from [console.x.com](https://console.x.com) → Apps → `summer-of-burgers`
3. Run:

```powershell
.\scripts\collect-and-sync.cmd
```

That checks **new** `@BarstoolBigCat` image tweets since the last run, runs a local **AI burger check** on each photo, imports burgers only, then uploads to R2/D1. Non-burger images are remembered in `data/collector-state.json` so they are not scanned again.

One-time catch-up for anything missed since `2026-05-25`:

```powershell
.\scripts\collector.cmd --backfill
.\scripts\sync-to-cloudflare.cmd
```

Optional: force one tweet through the scanner:

```powershell
.\scripts\collector.cmd --tweet "https://x.com/BarstoolBigCat/status/PASTE_ID"
.\scripts\sync-to-cloudflare.cmd
```

List image tweets vs site / scanner memory:

```powershell
.\scripts\collector.cmd --list-campaign
```

First run downloads the vision model into `.cache/transformers` (one time).

New images are written to:

- `public/images/originals/`
- `public/images/thumbs/`
- `public/data/burgers.json`
- `public/data/fan-burgers.json` for local fan submissions

Failed imports are logged to `data/failed/retry-queue.json`.

## Voting Rules

- Big Cat Duel has one official counted result per anonymous browser token per Eastern calendar day.
- Fan Duel has its own separate fan vote per anonymous browser token per Eastern calendar day.
- The browser token is random and stored in localStorage. D1 stores only a salted hash of that token.

## Automatic checks (no manual watching)

X does **not** notify your PC when someone tweets. This project **polls the API** on a timer: “any new tweets since last run?” → download images → AI burger check → sync if yes.

Install a Windows scheduled task (every **30 minutes** by default):

```powershell
.\scripts\install-scheduled-task.cmd
```

Custom interval (e.g. 15 minutes):

```powershell
.\scripts\install-scheduled-task.cmd 15
```

See if it’s installed and read recent run logs:

```powershell
.\scripts\collector-status.cmd
```

Logs append to `data/collector-schedule.log`. Your PC needs to be on (or sleeping with the task allowed to wake). Each run only hits **new** tweets thanks to `data/collector-state.json`.

## 24/7 collector on Linux (CachyOS)

From Windows (copies project + `.env` + wrangler login if present):

```powershell
node scripts\deploy-to-linux.cjs 192.168.1.167 glorgy2 YOUR_SSH_PASSWORD
```

On the Linux PC, the systemd user timer runs every 30 minutes: `scripts/linux/collect-and-sync.sh`. Logs: `data/collector-schedule.log`.

If sync fails with “not authenticated”, run once on Linux: `cd ~/summer-of-burgers && npx wrangler login`

## Cloudflare Deployment

If `wrangler`, `npm`, and `npx` are not on PATH, use the bundled tooling in this repo:

```powershell
.\scripts\bootstrap-tools.ps1
.\node_modules\.bin\wrangler.cmd login
.\scripts\predeploy.ps1
.\scripts\sync-to-cloudflare.ps1
.\scripts\deploy-pages.ps1
```

See [DEPLOY.md](DEPLOY.md) for dashboard-only steps, binding names, and the `VOTE_SALT` secret.

Resources:

1. Pages project `summer-of-burgers`
2. D1 database `summer-of-burgers` bound as `DB`
3. R2 bucket `summer-of-burgers-images` bound as `BURGER_IMAGES`
4. Replace `database_id` in `wrangler.toml` after `wrangler d1 create`
5. Set `VOTE_SALT` with `wrangler pages secret put`

`sync-to-cloudflare.ps1` uploads local images (including `public/images/share/`) to R2, runs the D1 schema migration, exports `public/data/burgers.json` to `data/seed-burgers.sql`, and imports it into D1.

## Share Cards

Generate social cards after imports:

```powershell
$Node = Join-Path $HOME ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
& $Node scripts\generate-share-cards.cjs
```

The live X share links point to `/share/official/<burger-id>` or `/share/fan/<burger-id>`, which expose `summary_large_image` Twitter Card metadata.

## Filename Format

Each imported image uses:

```text
YYYY-MM-DD__barstoolbigcat__tweet-<tweetId>__img-<index>__<category-or-caption-slug>.<ext>
```

Example:

```text
2026-05-25__barstoolbigcat__tweet-2059041294899347598__img-1__smashburger.jpg
```

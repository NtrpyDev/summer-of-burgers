# Deploy Summer of Burgers

This guide covers deployment when `node`, `npm`, `npx`, and `wrangler` are not on PATH.

## One-time tool setup

```powershell
cd E:\BCBurgerTracker
.\scripts\bootstrap-tools.ps1
.\node_modules\.bin\wrangler.cmd login
```

`bootstrap-tools.ps1` downloads portable Node into `.tools/` and runs `npm install`, which installs local Wrangler.

## Predeploy checks

```powershell
.\scripts\predeploy.ps1
```

Runs smoke test, share-card generation, and `data/seed-burgers.sql` export.

## Collector smoke test (new tweet URL)

```powershell
$env:NODE_PATH = Join-Path $HOME ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"
$Node = Join-Path $HOME ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
& $Node scripts\collector.cjs --tweet "https://x.com/BarstoolBigCat/status/PASTE_ID"
```

`0 imported, 1 skipped` means the tweet is already in `burgers.json`.

## Cloudflare resources

| Resource | Name | Pages binding / secret |
|----------|------|------------------------|
| Pages project | `summer-of-burgers` | — |
| D1 database | `summer-of-burgers` | `DB` |
| R2 bucket | `summer-of-burgers-images` | `BURGER_IMAGES` |
| Secret | random salt | `VOTE_SALT` |

### CLI provisioning (after `wrangler login`)

```powershell
.\node_modules\.bin\wrangler.cmd d1 create summer-of-burgers
.\node_modules\.bin\wrangler.cmd r2 bucket create summer-of-burgers-images
```

Copy the D1 `database_id` from the create output into `wrangler.toml`.

```powershell
$salt = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
$salt | .\node_modules\.bin\wrangler.cmd pages secret put VOTE_SALT --project-name summer-of-burgers
```

### Pages bindings (dashboard)

In **Workers & Pages → summer-of-burgers → Settings → Functions**:

1. **D1 bindings**: variable `DB` → database `summer-of-burgers`
2. **R2 bindings**: variable `BURGER_IMAGES` → bucket `summer-of-burgers-images`
3. **Secrets**: `VOTE_SALT` (same value in Production and Preview)

## Deploy

```powershell
.\scripts\sync-to-cloudflare.ps1
.\scripts\deploy-pages.ps1
```

Or only upload the site (skip R2/D1 sync):

```powershell
.\scripts\deploy-pages.ps1 -SkipSync
```

`deploy-pages.ps1` runs predeploy, sync (unless skipped), then `wrangler pages deploy public`.

## Dashboard-only path (no Wrangler login)

1. Create D1, R2, and Pages project in the Cloudflare dashboard (names above).
2. Add bindings and `VOTE_SALT` as in the table.
3. Upload `public/` and `functions/` via **Create deployment** (drag-and-drop or Git).
4. Run D1 SQL manually: `migrations/0001_schema.sql` then `data/seed-burgers.sql` in the D1 console.
5. Upload images to R2 under `originals/`, `thumbs/`, `fan/`, and `share/` (same keys as local filenames).

Wrangler sync is strongly recommended for R2 bulk upload.

## After deploy

- Open `https://<your-pages-host>/share/official/<burger-id>` and confirm Twitter Card meta loads.
- X cannot fetch `localhost`; share previews only work on the public URL.
- Share images are served from R2 via `/api/image/share/<id>.jpg` after sync.

## Status on this machine (last check)

- Predeploy: smoke test (4 burgers), share cards, D1 export — passed
- Collector `--tweet` URL: passed (skipped duplicate)
- Local Wrangler: `node_modules/.bin/wrangler.cmd` v4.95.0
- Wrangler auth: run `wrangler login` before deploy
- `wrangler.toml` `database_id`: still placeholder until D1 is created

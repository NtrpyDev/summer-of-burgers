# Deploy — Linux server + Cloudflare

## Prerequisites

- Linux with Node 20+ and `git`
- Cloudflare account, Pages project `summer-of-burgers`
- D1 `summer-of-burgers`, R2 `summer-of-burgers-images`
- `VOTE_SALT` secret on Pages (dashboard → Variables and Secrets)

## First-time on the server

```bash
cd ~/summer-of-burgers
npm install
npx wrangler login
bash scripts/linux/install-server.sh
```

## Manual deploy

```bash
# R2 images + D1 seed + Pages
bash scripts/linux/sync-to-cloudflare.sh
bash scripts/linux/deploy-pages.sh

# Or both via collector pipeline
bash scripts/linux/collect-and-sync.sh
```

`deploy-pages.sh` alone skips R2/D1 unless you omit `SKIP_SYNC`.

## Cloudflare bindings

**Workers & Pages → summer-of-burgers → Settings → Functions**

| Binding | Name |
|---------|------|
| D1 | `DB` → `summer-of-burgers` |
| R2 | `BURGER_IMAGES` → `summer-of-burgers-images` |
| Secret | `VOTE_SALT` |

## Git push (with PII scan)

```bash
bash scripts/linux/push-github.sh
```

Scans staged files for LAN IPs, tokens, emails, and `.env` before commit/push.

## Launch reset (clear votes / Elo)

```bash
bash scripts/linux/launch-reset.sh
```

# siyf-watch

Automated health checks for **SIYF** — runs in the cloud on a schedule. **End users never touch the command line.**

This repo is the ops layer:
- Probes **SIYF-API** (ESPN proxy, Action Network, cache headers, rate limits)
- Runs the full **parse adjuster / engine** test rings against your app repo
- Verifies the **Cloudflare worker** deployment via `wrangler`
- Files a **GitHub Issue** when something breaks (via `gh` CLI)

## What runs automatically

| Workflow | Schedule | What it checks |
|----------|----------|----------------|
| **Daily makesure** | Every day 15:00 UTC | API probes + all engine rings + live smoke + wrangler |
| **API pulse** | Every 6 hours | Lightweight API health only |
| **Engine gate** | On demand / dispatch | Engine rings without full daily suite |

Reports are saved as GitHub Actions **artifacts** (`watch-YYYY-MM-DD.json`).

## One-time setup (you, not users)

See [SETUP.md](./SETUP.md). Summary:

1. Create GitHub repo `siyf-watch` and push this folder
2. Set repository **variables** and **secrets**
3. Enable GitHub Actions — cron jobs start automatically

Optional: copy `templates/monorepo-pr-gate.yml` into your app repo (already added at `.github/workflows/siyf-pr-gate.yml` in the monorepo).

## How failures reach you

```
cron / push ──► GitHub Actions ──► checks fail ──► gh issue create (label: siyf-watch)
                                              └──► artifact JSON for debugging
```

No email to users. No terminal commands for users. You fix the engine/API, push, next run goes green.

## Future: `siyf-engine` (not yet)

[`siyf-engine`](https://github.com/Sports-in-your-face/siyf-engine) is the standalone engine repo. Chrome installs it from GitHub on `npm ci` — set `SIYF_SOURCE_REPO=Sports-in-your-face/siyf-engine` in siyf-watch.

## Local dev (optional)

Only for debugging the watch scripts themselves:

```bash
# From monorepo layout (siyf-watch sibling to siyf-chrome)
SIYF_APP_ROOT=.. SIYF_API_URL=https://siyf-api.nic-58f.workers.dev npm run watch:daily
```

## Tools used

- **GitHub Actions** — cron scheduler (replaces manual cron on a server)
- **git / gh** — checkout app repo, file issues
- **wrangler** — verify Cloudflare worker deployments
- **npm** — runs existing `drift:*` scripts in `siyf-chrome`

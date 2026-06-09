# siyf-watch setup

One-time configuration. After this, everything runs on GitHub's schedule — **users never run CLI commands**.

## 1. Create the repo

```bash
cd siyf-watch
git init
git add .
git commit -m "feat: add siyf-watch automated health checks"
gh repo create Sports-in-your-face/siyf-watch --private --source=. --push
```

Repo: [**Sports-in-your-face/siyf-watch**](https://github.com/Sports-in-your-face/siyf-watch) (private ops layer).

## 2. Repository variables

GitHub → **siyf-watch** → Settings → Secrets and variables → Actions → **Variables**

| Variable | Example | Purpose |
|----------|---------|---------|
| `SIYF_SOURCE_REPO` | `Sports-in-your-face/siyf-engine` | Engine package (or monorepo with `siyf-chrome/` + `siyf-api/`) |
| `SIYF_API_URL` | `https://siyf-api.nic-58f.workers.dev` | Production worker URL |

## 3. Repository secrets

| Secret | Purpose |
|--------|---------|
| `SIYF_REPO_TOKEN` | PAT or fine-grained token with `contents: read` on the app monorepo |
| `CLOUDFLARE_API_TOKEN` | `wrangler deployments list` in daily makesure |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account (wrangler) |

`GITHUB_TOKEN` is provided automatically for filing issues in **this** repo.

### Creating `SIYF_REPO_TOKEN`

Fine-grained PAT → read access to the app monorepo only. Classic PAT `repo` scope also works for private repos.

## 4. Enable Actions

Settings → Actions → General → allow workflows.

Cron schedules:
- **Daily makesure**: `0 15 * * *` UTC
- **API pulse**: every 6 hours

## 5. App monorepo PR gate (recommended)

The file `.github/workflows/siyf-pr-gate.yml` in your **app monorepo** blocks PRs that break the adjuster offline rings. Push that repo to GitHub — PR checks run automatically.

## 6. Verify

Actions → **Daily makesure** → **Run workflow** (manual once).

Expect:
- `api-health` — all probes green
- `engine-checks` — drift/chaos/merge/kill/live pass
- `wrangler-status` — recent deployment listed (or skipped if no CF token)

Download the `watch-report` artifact.

## 7. When something fails

1. Open the failed workflow run
2. Download artifact JSON
3. Fix `registry.ts`, API, or engine in the app repo
4. Push fix → PR gate goes green → next daily makesure confirms

Issues are auto-filed with label `siyf-watch`.

## Optional: dispatch on app push

Copy `templates/monorepo-dispatch.yml` into the app repo to trigger **Engine gate** in siyf-watch after every main-branch push.

Requires `SIYF_WATCH_REPO` variable and `SIYF_WATCH_TOKEN` secret on the **app** repo.

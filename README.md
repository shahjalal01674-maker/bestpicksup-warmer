# bestpicksup-warmer

Public companion repository for `bestpicksup.com` — runs scheduled GitHub Actions
to pre-warm the Cloudflare edge cache for every URL in the site's sitemap.

## Why this repo is public

GitHub Actions cron schedules run reliably on **public** repos but get heavily
throttled on private free-tier repos (`*/30` schedules fire only ~2 times per
day instead of 48 times). Splitting the warmers into a separate public repo
solves this without exposing any application source code.

The site source remains in a private repo. Only these two stateless workflows
that `curl` public sitemap URLs live here.

## Workflows

| File | Schedule (UTC) | What it does |
|---|---|---|
| `warm-edge-cache.yml` | `*/30 * * * *` (every 30 min) | Fetches sitemap → fires one parallel `curl` per URL → pings Bing/Yandex |
| `global-regional-warm.yml` | `0 */6 * * *` (every 6 hours) | Same warmup, but split into 3 matrix jobs labelled US/UK/CA |

Both run from GitHub-hosted Azure US runners, so every fetch routes to the
nearest US Cloudflare colo and populates that colo's edge cache.

## Architecture

```
GitHub Actions (this repo, public)        Cloudflare cron-warmer Worker
       │                                  (separate, runs inside CF colos)
       ▼                                          │
bestpicksup.com sitemap.xml ◄──────────────────────┘
       │
       ▼
 Cloudflare edge cache populated ─→ visitors get warm responses
```

## Trigger manually

In the Actions tab, pick a workflow → click **Run workflow** → main → Run workflow.

## Adjust cadence

Edit the `cron:` line in either YAML and commit. GitHub re-registers the schedule
on the next push to the default branch (usually within 30 min).

## What this repo does NOT contain

- Site source code (Astro / Sanity / middleware)
- Worker code (Cloudflare bindings, KV namespaces, secrets)
- Any authentication tokens or API keys

The workflows hit only publicly accessible URLs and don't authenticate to
anything. No secrets are needed.

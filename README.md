# Interchouette

Public site for [interchouette.net](https://interchouette.net/): Gregory Roussac / Interchouette ITC.

## Stack

- Angular 22 (standalone, signals, zoneless, OnPush, SCSS)
- Fonts / icons / motion via npm (`@fontsource/*`, `font-awesome`, `animate.css`) built into the CSS bundle (no CDN links in `index.html`)
- Build-time prerender for `/`, `/CV`, `/privacy`, `/terms`
- Per-route SEO: unique titles/descriptions, canonical, Open Graph / Twitter, JSON-LD
- URLs: no trailing slash (`/CV/` → `/CV` on the static host)
- Vitest (unit) · Playwright desktop / mobile / tablet (host Chrome; no browser download)
- Render Static Site (CDN; build on deploy)

## Layout

| Path       | Role                                          |
| ---------- | --------------------------------------------- |
| `www/`     | Angular site (`package.json`, `node_modules`) |
| `mcp/`     | Interchouette MCP crate (`interchouette-mcp`) |
| `backend/` | Website chat crate (`interchouette-chat`)     |
| `db/`      | Committed SQLite (`interchouette.db`)         |

## Develop

```bash
cd www
npm ci
npm start
```

## Build (static + prerender)

```bash
cd www
npm run build
```

Publish directory for Render: `www/dist/interchouette/browser`

Node: **24.19.0** (or 22.22.3+ / 24.15.0+). See `www/.node-version`. On Render set `NODE_VERSION=24.19.0`, root directory / build command under `www/`, and clear build cache after changing it.

## Test

```bash
cd www
npm test
```

Full local gate (same shape as GitHub Actions):

```bash
cd www
npm run ci
```

CI (GitHub Actions on `dev` / PRs into `dev`): Prettier, `npm audit --audit-level=high`, production build + prerender, unit tests, and a static publish layout check (including MCP discovery files). Pin Node with `www/.nvmrc` (**24.19.0**). On push to `dev` after those steps succeed, CI calls the static-site Render deploy hook (`RENDER_DEPLOY_HOOK_URL` org secret). Keep Render Auto-Deploy **Off** so only that hook triggers production.

Chat web service (`api.interchouette.net`): Render Docker from `backend/Dockerfile` (context `.`), auto-deploy when CI checks pass and `backend/**` changes.

Interchouette MCP image CI (on `mcp/` / `db/` / Docker changes): builds and pushes `interchouette/interchouette-mcp` `:dev` and `:latest`, then calls the MCP Render deploy hook (`RENDER_DEPLOY_HOOK_URL_MCP` org secret).

E2E: Playwright specs in `www/e2e/` (`npm run e2e` from `www/`) with **desktop**, **mobile** (Pixel 7), and **tablet** (834×1194) projects via host Chrome. **Do not** run `playwright install` or download browsers in this repo. If you install npm deps in an environment that would fetch browsers, set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.

## Render redirects (required)

Dashboard → Redirects/Rewrites must **not** Redirect `/*` to `/index.html` (that 301s `/terms` → `/index.html` and breaks clean URLs). Use:

| Source                       | Destination                                      | Action                       |
| ---------------------------- | ------------------------------------------------ | ---------------------------- |
| `/CV/CV_Gregory_Roussac.pdf` | `/CV/Gregory_Roussac.pdf`                        | Redirect                     |
| `/CV/CV_Roussac.pdf`         | `/CV/Gregory_Roussac.pdf`                        | Redirect                     |
| `/CV/`                       | `/CV`                                            | Redirect                     |
| `/about`                     | `/about/index.html`                              | **Rewrite**                  |
| `/news`                      | `/news/index.html`                               | **Rewrite**                  |
| `/archive`                   | `/archive/index.html`                            | **Rewrite**                  |
| `/terms`                     | `/terms/index.html`                              | **Rewrite**                  |
| `/privacy`                   | `/privacy/index.html`                            | **Rewrite**                  |
| `/account`                   | `/account/index.html`                            | **Rewrite**                  |
| `/gis-signin`                | `/gis-signin/index.html`                         | **Rewrite**                  |
| `/CV`                        | `/CV/index.html`                                 | **Rewrite**                  |
| `/feed`                      | `https://api.interchouette.net/v1/news/rss.xml`  | Redirect                     |
| `/rss.xml`                   | `https://api.interchouette.net/v1/news/rss.xml`  | Redirect                     |
| `/atom.xml`                  | `https://api.interchouette.net/v1/news/atom.xml` | Redirect                     |
| `/*`                         | `/index.html`                                    | **Rewrite** (never Redirect) |

Same rules live in `www/public/_redirects` for hosts that honor it. The static build also writes sibling files (`news.html`, `about.html`, …) so clean URLs still get prerendered HTML when the SPA catch-all would otherwise win.

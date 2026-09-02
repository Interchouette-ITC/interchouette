# Interchouette

Public site for [interchouette.net](https://interchouette.net/): Gregory Roussac / Interchouette ITC.

## Stack

- Angular 22 (standalone, signals, zoneless, OnPush, SCSS)
- Fonts / icons / motion via npm (`@fontsource/*`, `font-awesome`, `animate.css`) built into the CSS bundle (no CDN links in `index.html`)
- Build-time prerender for public pages (see Pages)
- Per-route SEO: unique titles/descriptions, canonical, Open Graph / Twitter, JSON-LD
- URLs: no trailing slash (`/CV/` → `/CV` on the static host)
- Vitest (unit) · Playwright desktop / mobile / tablet (host Chrome; no browser download)
- Render Static Site (CDN; build on deploy)

## Pages

| Path                             | Page                                     |
| -------------------------------- | ---------------------------------------- |
| `/`                              | Home                                     |
| `/news`                          | News                                     |
| `/archive`                       | News archive index                       |
| `/archive/:weekId`               | Archived week (e.g. `/archive/2026-W35`) |
| `/CV`                            | CV (HTML + PDF)                          |
| `/about`                         | About                                    |
| `/privacy`                       | Privacy Policy                           |
| `/terms`                         | Terms of Service                         |
| `/login`                         | Client Google sign-in                    |
| `/account`                       | Client account                           |
| `/gis-signin`                    | Google sign-in callback                  |
| `/feed`, `/rss.xml`, `/atom.xml` | News feeds (API)                         |

Host redirect/rewrite rules for the static site live in `www/public/_redirects` (operator config, not duplicated here).

## Layout

| Path       | Role                                                               |
| ---------- | ------------------------------------------------------------------ |
| `www/`     | Angular site (`package.json`, `node_modules`)                      |
| `mcp/`     | Interchouette MCP crate (`interchouette-mcp`); see `mcp/README.md` |
| `backend/` | Website chat crate (`interchouette-chat`)                          |
| `db/`      | Committed SQLite (`interchouette.db`) for MCP                      |

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

CI (GitHub Actions on `dev` / PRs into `dev`): Prettier, `npm audit --audit-level=high`, production build + prerender, unit tests, and a static publish layout check (including MCP discovery files). Pin Node with `www/.nvmrc` (**24.19.0**). On push to `dev` after those steps succeed, CI calls the static-site Render deploy hook (`RENDER_DEPLOY_HOOK_URL` org secret). Keep Render Auto-Deploy **Off** so only that hook triggers production. A nightly workflow (04:00 Europe/Paris) calls the same hook so prerendered `/news` and `/archive/*` stay aligned with the API cache.

Chat API (`api.interchouette.net`): Render builds Docker from `backend/Dockerfile` (context `.`). Auto-Deploy **Off**; `chat-ci.yml` on `dev` calls `RENDER_DEPLOY_HOOK_URL_API` only when `backend/**` changes (not on `db/news.db`-only commits). Runtime archive sync commits `db/news.db` to `dev` via `NEWS_GITHUB_TOKEN` without redeploying the API.

Interchouette MCP: CI builds and pushes Hub image `interchouette/interchouette-mcp` (`:dev`, `:latest`); Render runs that image (not a repo build). Hook `RENDER_DEPLOY_HOOK_URL_MCP` after `mcp/` / `db/interchouette.db` / Docker changes.

E2E: Playwright specs in `www/e2e/` (`npm run e2e` from `www/`) with **desktop**, **mobile** (Pixel 7), and **tablet** (834×1194) projects via host Chrome. **Do not** run `playwright install` or download browsers in this repo. If you install npm deps in an environment that would fetch browsers, set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.

## Thanks

This site and its services stand on excellent open-source projects and hosts:

| Project                                                                                                                  | Role here                              |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| [Angular](https://angular.dev/)                                                                                          | Public SPA (`www/`)                    |
| [Rust](https://www.rust-lang.org/)                                                                                       | MCP and website chat backends          |
| [Axum](https://github.com/tokio-rs/axum) / [Tokio](https://tokio.rs/)                                                    | HTTP, WebSocket, async runtime         |
| [rmcp](https://crates.io/crates/rmcp)                                                                                    | MCP Streamable HTTP server             |
| [SQLite](https://sqlite.org/) (`rusqlite` / `sqlx`)                                                                      | Knowledge and news stores              |
| [Render](https://render.com/)                                                                                            | Static site, API, and MCP hosting      |
| [Vitest](https://vitest.dev/) / [Playwright](https://playwright.dev/)                                                    | Unit and e2e tests                     |
| [Fontsource](https://fontsource.org/) / [Font Awesome](https://fontawesome.com/) / [animate.css](https://animate.style/) | Fonts, icons, motion (bundled, no CDN) |

Thank you to their maintainers and communities.

## License

Business Source License 1.1 (source-available). See [`LICENSE`](LICENSE).
You may run your own personal or internal deployment; you may not resell or
offer it as a competing hosted product. Change license: Apache-2.0 on 2099-01-01.

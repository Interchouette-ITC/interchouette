# Interchouette

Public site for [interchouette.net](https://interchouette.net/): Gregory Roussac / Interchouette ITC.

## Stack

- Angular 22 (standalone, signals, zoneless, OnPush, SCSS)
- Fonts / icons / motion via npm (`@fontsource/*`, `font-awesome`, `animate.css`) built into the CSS bundle (no CDN links in `index.html`)
- Build-time prerender for `/`, `/CV`, `/privacy`, `/terms`
- URLs: no trailing slash (`/CV/` → `/CV` on the static host)
- Vitest (unit) · Playwright specs (MCP / host Chrome; no browser download)
- Render Static Site (CDN; build on deploy)

## Develop

```bash
npm ci
npm start
```

## Build (static + prerender)

```bash
npm run build
```

Publish directory for Render: `dist/interchouette/browser`

Node: **24.19.0** (or 22.22.3+ / 24.15.0+). See `.node-version`. On Render set `NODE_VERSION=24.19.0` and clear build cache after changing it.

## Test

```bash
npm test
```

Full local gate (same shape as GitHub Actions):

```bash
npm run ci
```

CI (GitHub Actions on `dev` / PRs into `dev`): Prettier, `npm audit --audit-level=high`, production build + prerender, unit tests, and a static publish layout check. Pin Node with `.nvmrc` (**24.19.0**). On Render, set Auto-Deploy to **After CI Checks Pass** so deploys wait for this workflow.

E2E: Playwright **specs** live in `e2e/`; config is `.cursor/scripts/playwright.config.ts` (`npm run e2e`). Use the shared Playwright MCP / host Chrome. **Do not** run `playwright install` or download browsers in this repo. If you install npm deps in an environment that would fetch browsers, set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.

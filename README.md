# Interchouette

Public site for [interchouette.net](https://interchouette.net/): Gregory Roussac / Interchouette ITC.

## Stack

- Angular 22 (standalone, signals, zoneless, OnPush, SCSS)
- Fonts / icons / motion via npm (`@fontsource/*`, `font-awesome`, `animate.css`) built into the CSS bundle (no CDN links in `index.html`)
- Build-time prerender for `/`, `/CV/`, `/privacy`, `/terms`
- URLs: no trailing slash except `/CV/` (`/CV` → `/CV/` on the static host)
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

Node: **22.22.3+** (see `.node-version` / `package.json` `engines`). On Render, clear build cache after the first Node upgrade.

## Test

```bash
npm test
```

E2E: Playwright **specs** live in `e2e/`; config is `.cursor/scripts/playwright.config.ts` (`npm run e2e`). Use the shared Playwright MCP / host Chrome. **Do not** run `playwright install` or download browsers in this repo. If you install npm deps in an environment that would fetch browsers, set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.

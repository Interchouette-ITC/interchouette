# Interchouette

Public site for [interchouette.net](https://interchouette.net/): Gregory Roussac / Interchouette ITC.

## Stack

- Angular 22 (standalone, signals, zoneless, OnPush, SCSS)
- Build-time prerender for `/`, `/CV`, `/privacy`, `/terms`
- Vitest (unit) · Playwright (e2e)
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

## Test

```bash
npm test
```

E2E: Playwright **specs** live in `e2e/`. Use the shared Playwright MCP / host Chrome. **Do not** run `playwright install` or download browsers in this repo. If you install npm deps in an environment that would fetch browsers, set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.

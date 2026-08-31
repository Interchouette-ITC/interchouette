# Interchouette API (`backend/`)

HTTP API for the public site: visitor chat (WebSocket), news JSON/RSS/Atom, booking proxy.

Public hostname: **`https://api.interchouette.net`** (same Render web service; formerly `chat.interchouette.net`).

**No chat database.** Durable retrieval is the bot↔Greg Slack DM. Away mode must call the remote MCP HTTP API; it does not open `interchouette.db`.

## Public OpenAPI

`GET https://api.interchouette.net/openapi.json` (local: `http://127.0.0.1:8080/openapi.json`) documents the public subset only:

- `GET /health`
- `GET /ready`
- `GET /v1/presence`
- `GET /v1/news`
- `GET /v1/news/rss.xml`
- `GET /v1/news/atom.xml`
- `GET /v1/news/archive`
- `GET /v1/news/archive/{week_id}`

Session, WebSocket, and `/v1/book` stay implemented but are omitted from the public document.

## Env

| Variable                    | Role                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CHAT_ENV`                  | Slack label: `local` / `e2e` / `prod` (default: `prod` if `PORT` set, else `local`). `local` never posts to Slack (avoids agent-restart spam). Non-prod thread headers are wrapped with warning marks. |
| `CHAT_LISTEN`               | Bind address (default `0.0.0.0:8080`)                                                                                                                                                                  |
| `CHAT_FORCE_MODE`           | `live` or `away` (local/tests)                                                                                                                                                                         |
| `SLACK_BOT_TOKEN`           | Bot token (`xoxb-…`): presence, open DM, post to Greg                                                                                                                                                  |
| `SLACK_APP_TOKEN`           | App token (`xapp-…`): Socket Mode so Greg DM replies reach the widget                                                                                                                                  |
| `GREG_SLACK_USER_ID`        | Greg's Slack user id                                                                                                                                                                                   |
| `OPENROUTER_API_KEY`        | Away LLM (required)                                                                                                                                                                                    |
| `OPENROUTER_MODEL`          | Away model id (required), e.g. `google/gemini-2.5-flash`                                                                                                                                               |
| `LLM_GUARD_ENABLED`         | Away LLM input/output scanners (default on; set `false` to disable)                                                                                                                                    |
| `LLM_GUARD_MODE`            | `log_only` scans and logs without blocking                                                                                                                                                             |
| `BOOKING_SCHEDULE_URL`      | Public appointment page. When set, ITCy sends this link for meetings                                                                                                                                   |
| `CHAT_PLAYLIST_AFTER_TURNS` | Away mode: after N visitor turns (default 3), ITCy may emit `[[PLAYLIST: play]]` once                                                                                                                  |
| `MCP_URL`                   | Interchouette MCP Streamable HTTP URL (default `https://mcp.interchouette.net/`)                                                                                                                       |
| `CORS_ORIGIN`               | Browser origin (default `https://interchouette.net`)                                                                                                                                                   |
| `LINKEDIN_LI_AT`            | LinkedIn `li_at` session cookie for `/v1/news` LinkedIn fetches (server-only)                                                                                                                          |
| `NEWS_CACHE_TTL_SECS`       | News feed cache lifetime in seconds (default `14400`, 4 hours)                                                                                                                                         |
| `NEWS_FETCH_LIMIT`          | Max posts per feed on `/v1/news` (default `8`)                                                                                                                                                         |
| `NEWS_DB`                   | Optional override for archive SQLite path (default `/app/db/news.db` in Docker, else `db/news.db`)                                                                                                     |
| `NEWS_GITHUB_TOKEN`         | PAT for Contents API sync (Render **chat API** only; not the static www site)                                                                                                                          |

`NEWS_GITHUB_REPO`, `NEWS_GITHUB_PATH`, and `NEWS_GITHUB_BRANCH` default in code to `Interchouette-ITC/interchouette`, `db/news.db`, and `news-db` (not `dev`, so archive sync does not retrigger API deploys). Override only for forks or experiments.

`GET /v1/news` (and RSS/Atom siblings) share one in-memory cache (default 4 hours). Successful refreshes **merge** scraped items into SQLite (by stable post id; ISO week from `published_at`; keep 52 weeks). When `NEWS_GITHUB_TOKEN` is set on the API, it **pulls** `db/news.db` on boot and **pushes** after a merge that changed rows (~4h cadence). The `/news` page and `/archive` call this API. Set `LINKEDIN_LI_AT` from your browser LinkedIn cookies when the ITC LinkedIn feed should populate; rotate it when LinkedIn returns an authwall.

### Local news archive

```bash
NEWS_DB=db/news.db   # optional; this is already the local default
```

GitHub sync needs only `NEWS_GITHUB_TOKEN` on the deployed API service.Bot OAuth scopes for DM + presence: `im:write`, `chat:write`, `users:read`, `dnd:read`, plus `im:history` for Socket Mode inbound.

Chat live when Slack presence is `active` and DND is not in effect now (inside `next_dnd_*` window and/or snooze). Bare `dnd_enabled` outside that window is ignored.

Live replies: Greg answers in the bot DM thread (Socket Mode). No visitor-facing “message sent” system line.

## Render (production)

Website static site stays separate. This API needs its **own** web service (WebSockets; free tier sleep breaks them).

1. Build `backend/Dockerfile` (context = repo root) → Docker web service from Git.
2. Custom domain **`api.interchouette.net`** → that service. **`chat.interchouette.net`** is a deprecated alias (same service); do not use it in new site or worker URLs.
3. Env on the service (all required): `CHAT_ENV=prod`, `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `GREG_SLACK_USER_ID`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL=google/gemini-2.5-flash`, `MCP_URL=https://mcp.interchouette.net/`, `CORS_ORIGIN=https://interchouette.net`. Set `BOOKING_SCHEDULE_URL` to the public appointment page so ITCy can send that link. Prefer `PORT` from the host (binary picks it up when `CHAT_LISTEN` is unset). Slack thread headers include `env=prod|local|e2e`.
4. Slack app: Socket Mode on; scopes include `dnd:read`.
5. Static site: CI on `dev` posts the Render deploy hook after checks (`RENDER_DEPLOY_HOOK_URL`). Keep Render Auto-Deploy **Off**. Widget and news call `https://api.interchouette.net`.
6. MCP env `CHAT_BACKEND_URL` (booking / `get_news`) should be `https://api.interchouette.net`.

## Local

Create a repo-root `.env` with the variables above (Slack, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `MCP_URL`, optional `BOOKING_SCHEDULE_URL`). The binary loads repo-root `.env` on start (does not override vars already in the shell).

`CHAT_ENV=local` does not open Slack Socket Mode (that connection stays on prod). It also does **not** post visitor threads to Slack (agent restarts must not spam Greg). Greg replies on local are only useful when Slack is enabled for another env.

```bash
cargo run --manifest-path backend/Cargo.toml
```

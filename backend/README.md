# Interchouette chat

Website visitor chat: WebSocket sessions, Slack DM for live replies, remote Interchouette MCP for away mode.

**No chat database.** Durable retrieval is the bot↔Greg Slack DM. Away mode must call the remote MCP HTTP API; it does not open `interchouette.db`.

## Public OpenAPI

`GET https://chat.interchouette.net/openapi.json` (local: `http://127.0.0.1:8080/openapi.json`) documents the public subset only:

- `GET /health`
- `GET /ready`
- `GET /v1/presence`
- `GET /v1/news`

Session, WebSocket, and `/v1/book` stay implemented but are omitted from the public document.

## Env

| Variable               | Role                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `CHAT_ENV`             | Slack label: `local` / `e2e` / `prod` (default: `prod` if `PORT` set, else `local`) |
| `CHAT_LISTEN`          | Bind address (default `0.0.0.0:8080`)                                               |
| `CHAT_FORCE_MODE`      | `live` or `away` (local/tests)                                                      |
| `SLACK_BOT_TOKEN`      | Bot token (`xoxb-…`): presence, open DM, post to Greg                               |
| `SLACK_APP_TOKEN`      | App token (`xapp-…`): Socket Mode so Greg DM replies reach the widget               |
| `GREG_SLACK_USER_ID`   | Greg's Slack user id                                                                |
| `OPENROUTER_API_KEY`   | Away LLM (required)                                                                 |
| `OPENROUTER_MODEL`     | Away model id (required), e.g. `google/gemini-2.5-flash`                            |
| `LLM_GUARD_ENABLED`    | Away LLM input/output scanners (default on; set `false` to disable)                 |
| `LLM_GUARD_MODE`       | `log_only` scans and logs without blocking                                          |
| `BOOKING_SCHEDULE_URL` | Public appointment page. When set, ITCy sends this link for meetings                |
| `MCP_URL`              | Interchouette MCP Streamable HTTP URL (default `https://mcp.interchouette.net/`)    |
| `CORS_ORIGIN`          | Browser origin (default `https://interchouette.net`)                                |
| `LINKEDIN_LI_AT`       | LinkedIn `li_at` session cookie for `/v1/news` LinkedIn fetches (server-only)       |
| `NEWS_CACHE_TTL_SECS`  | News feed cache lifetime in seconds (default `14400`, 4 hours)                      |
| `NEWS_FETCH_LIMIT`     | Max posts per feed on `/v1/news` (default `8`)                                      |

`GET /v1/news?locale=en|nl|fr` serves cached ITC LinkedIn and ITC X posts as JSON for the public `/news` page (and for the static site build that writes apex RSS/Atom). Syndication for readers and agents is on the apex site: `https://interchouette.net/rss.xml` and `https://interchouette.net/atom.xml` (not duplicated on this chat service). Set `LINKEDIN_LI_AT` from your browser LinkedIn cookies when the ITC LinkedIn feed should populate; rotate it when LinkedIn returns an authwall.

Bot OAuth scopes for DM + presence: `im:write`, `chat:write`, `users:read`, `dnd:read`, plus `im:history` for Socket Mode inbound.

Chat live when Slack presence is `active` and DND is not in effect now (inside `next_dnd_*` window and/or snooze). Bare `dnd_enabled` outside that window is ignored.

Live replies: Greg answers in the bot DM thread (Socket Mode). No visitor-facing “message sent” system line.

## Render (production)

Website static site stays separate. Chat needs its **own** web service (WebSockets; free tier sleep breaks them).

1. Build `backend/Dockerfile` (context = repo root) → Docker web service from Git.
2. Custom domain **`chat.interchouette.net`** → that service.
3. Env on the chat service (all required): `CHAT_ENV=prod`, `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `GREG_SLACK_USER_ID`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL=google/gemini-2.5-flash`, `MCP_URL=https://mcp.interchouette.net/`, `CORS_ORIGIN=https://interchouette.net`. Set `BOOKING_SCHEDULE_URL` to the public appointment page so ITCy can send that link. Prefer `PORT` from the host (binary picks it up when `CHAT_LISTEN` is unset). Slack thread headers include `env=prod|local|e2e`.
4. Slack app: Socket Mode on; scopes include `dnd:read`.
5. Static site: CI on `dev` posts the Render deploy hook after checks (`RENDER_DEPLOY_HOOK_URL`). Keep Render Auto-Deploy **Off**. Widget calls `https://chat.interchouette.net`.

## Local

Create a repo-root `.env` with the variables above (Slack, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `MCP_URL`, optional `BOOKING_SCHEDULE_URL`). The binary loads repo-root `.env` on start (does not override vars already in the shell).

`CHAT_ENV=local` does not open Slack Socket Mode (that connection stays on prod). Greg replies are read from the open Slack thread over HTTP, about every two seconds, only for sessions that already have a thread.

```bash
cargo run --manifest-path backend/Cargo.toml
```

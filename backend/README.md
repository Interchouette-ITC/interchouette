# Interchouette chat

Website visitor chat: WebSocket sessions, Slack DM for live replies, remote Interchouette MCP for away mode.

**No chat database.** Durable retrieval is the bot↔Greg Slack DM. Away mode must call the remote MCP HTTP API; it does not open `interchouette.db`.

## Env

| Variable             | Role                                                                                |
| -------------------- | ----------------------------------------------------------------------------------- |
| `CHAT_ENV`           | Slack label: `local` / `e2e` / `prod` (default: `prod` if `PORT` set, else `local`) |
| `CHAT_LISTEN`        | Bind address (default `0.0.0.0:8080`)                                               |
| `CHAT_FORCE_MODE`    | `live` or `away` (local/tests)                                                      |
| `SLACK_BOT_TOKEN`    | Bot token (`xoxb-…`): presence, open DM, post to Greg                               |
| `SLACK_APP_TOKEN`    | App token (`xapp-…`): Socket Mode so Greg DM replies reach the widget               |
| `GREG_SLACK_USER_ID` | Greg's Slack user id                                                                |
| `OPENROUTER_API_KEY` | Away LLM (required)                                                                 |
| `OPENROUTER_MODEL`   | Away model id (required), e.g. `openrouter/owl-alpha`                          |
| `MCP_URL`            | Interchouette MCP Streamable HTTP URL (default `https://mcp.interchouette.net/`)    |
| `CORS_ORIGIN`        | Browser origin (default `https://interchouette.net`)                                |

Bot OAuth scopes for DM + presence: `im:write`, `chat:write`, `users:read`, `dnd:read`, plus `im:history` for Socket Mode inbound.

Chat live when Slack presence is `active` and DND is not in effect now (inside `next_dnd_*` window and/or snooze). Bare `dnd_enabled` outside that window is ignored.

Live replies: Greg answers in the bot DM thread (Socket Mode). No visitor-facing “message sent” system line.

## Render (production)

Website static site stays separate. Chat needs its **own** web service (WebSockets; free tier sleep breaks them).

1. Build `backend/Dockerfile` (context = repo root) → Docker web service from Git.
2. Custom domain **`chat.interchouette.net`** → that service.
3. Env on the chat service (all required): `CHAT_ENV=prod`, `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `GREG_SLACK_USER_ID`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL=openrouter/owl-alpha`, `MCP_URL=https://mcp.interchouette.net/`, `CORS_ORIGIN=https://interchouette.net`. Prefer `PORT` from the host (binary picks it up when `CHAT_LISTEN` is unset). Slack thread headers include `env=prod|local|e2e`.
4. Slack app: Socket Mode on; scopes include `dnd:read`.
5. Static site build: `CHAT_WIDGET_ENABLED=true` (default). Widget calls `https://chat.interchouette.net`.

Static site deploy on Render is **manual** (`autoDeploy` off): trigger Deploy in the dashboard (or deploy hook), not on every `www/` commit.

## Local

```bash
cargo run --manifest-path backend/Cargo.toml
```

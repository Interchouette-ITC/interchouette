# Interchouette chat

Website visitor chat: WebSocket sessions, Slack DM for live replies, remote Interchouette MCP for away mode.

**No chat database.** Durable retrieval is the bot↔Greg Slack DM. Away mode must call the remote MCP HTTP API; it does not open `interchouette.db`.

## Env

| Variable             | Role                                                                           |
| -------------------- | ------------------------------------------------------------------------------ |
| `CHAT_LISTEN`        | Bind address (default `0.0.0.0:8080`)                                          |
| `CHAT_FORCE_MODE`    | `live` or `away` (local/tests)                                                 |
| `SLACK_BOT_TOKEN`    | Bot token for presence + DM                                                    |
| `SLACK_APP_TOKEN`    | App-level token for Socket Mode (`xapp-…`) so Greg DM replies reach the widget |
| `GREG_SLACK_USER_ID` | Greg's Slack user id                                                           |
| `OPENROUTER_API_KEY` | Away LLM (else MCP tool fallback)                                              |
| `OPENROUTER_MODEL`   | Override free model                                                            |
| `KNOWLEDGE_MCP_URL`  | Knowledge MCP Streamable HTTP URL (away mode)                                  |

Bot OAuth scopes for DM + presence: `im:write`, `chat:write`, `users:read`, `dnd:read`, plus `im:history` for Socket Mode inbound.

Chat live when Slack presence is `active` and DND is not in effect now (inside `next_dnd_*` window and/or snooze). Bare `dnd_enabled` outside that window is ignored.

Live replies: Greg answers in the bot DM with the session short code from the bot line.

## Local

```bash
cargo run --manifest-path backend/Cargo.toml
```

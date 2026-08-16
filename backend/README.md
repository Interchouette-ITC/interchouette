# Interchouette knowledge MCP + chat

Streamable HTTP MCP. **Read-only** committed SQLite file:

**`db/interchouette.db`**

Official MCP URL: `https://mcp.interchouette.net/interchouette`

Website chat (`/v1/sessions`, WebSocket) lives on the same process. **No chat database.** Durable retrieval is the bot↔Greg Slack DM. Knowledge DB is read-only for away-mode RAG only.

## How to update knowledge content

1. Edit `db/interchouette.db` (DB Browser for SQLite, `sqlite3`, etc.)
2. Commit + merge to `dev`
3. CI publishes `interchouette/interchouette-mcp:latest`
4. CI calls the Render deploy hook for the MCP service

No content inserts at runtime. No Postgres for knowledge or chat.

## Chat env

| Variable             | Role                                                                           |
| -------------------- | ------------------------------------------------------------------------------ |
| `CHAT_FORCE_MODE`    | `live` or `away` (local/tests)                                                 |
| `SLACK_BOT_TOKEN`    | Bot token for presence + DM                                                    |
| `SLACK_APP_TOKEN`    | App-level token for Socket Mode (`xapp-…`) so Greg DM replies reach the widget |
| `GREG_SLACK_USER_ID` | Greg's Slack user id                                                           |
| `OPENROUTER_API_KEY` | Away `ITCy` LLM (else FTS fallback)                                            |
| `OPENROUTER_MODEL`   | Override free model                                                            |

Live replies: Greg answers in the bot DM with `[S-XXXX] message` (the visitor short code from the bot line).

## Images

`interchouette/interchouette-mcp:latest` or `:dev` — port `8080`, path `/interchouette`.
Tags: **`:dev`** and **`:latest` only** (no semver tags).

## Local

```bash
make mcp-lint mcp-test
CHAT_FORCE_MODE=away cargo run --manifest-path backend/Cargo.toml -- --knowledge-db db/interchouette.db
```

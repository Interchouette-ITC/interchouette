# Interchouette MCP

Read-only Streamable HTTP MCP over committed **`db/interchouette.db`**.

Official MCP URL: `https://mcp.interchouette.net/` (alias `/interchouette` kept for old clients).

## Update content

1. Edit sources under **`mcp/catalog/`** (`docs.toml`, `products.toml`)
2. Rebuild the committed database: **`make mcp-db`**
3. Commit `db/interchouette.db` + catalog changes, push to `dev`
4. CI publishes `interchouette/interchouette-mcp:latest`

No Postgres. No runtime admin upsert API. Public catalog lives in this repo (not itc-cursor).

## Run (image)

`interchouette/interchouette-mcp:latest` or `:dev` - port `8080`, path `/`.

```bash
docker run --rm -p 8080:8080 interchouette/interchouette-mcp:latest
curl -sS http://127.0.0.1:8080/health
```

## Local binary

```bash
cargo run --manifest-path mcp/Cargo.toml -- --db db/interchouette.db
```

Env: `MCP_DB` (path to `.db`), `MCP_LISTEN`, `CORS_ORIGIN`, `MCP_ALLOWED_HOSTS`.

Chat write tools (`send_message_to_greg`, `get_chat_relay_status`) require `MCP_CHAT_TOKEN` plus `SLACK_BOT_TOKEN` and `GREG_SLACK_USER_ID`. `list_chat_capabilities` needs no token.

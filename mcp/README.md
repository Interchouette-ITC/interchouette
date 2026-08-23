# Interchouette MCP

Read-only Streamable HTTP MCP over committed **`db/interchouette.db`**.

Official MCP URL: **`https://mcp.interchouette.net/`**

Discovery on the public site:

- Server card: `https://interchouette.net/.well-known/mcp.json`
- Site map: `https://interchouette.net/llms.txt`

## Use from any MCP client

Point Streamable HTTP clients at the official URL. Do **not** copy catalog content into other repos; edit `mcp/catalog/` here and rebuild with `make mcp-db`.

Cursor / compatible `mcp.json` example:

```json
{
  "mcpServers": {
    "interchouette-mcp": {
      "url": "https://mcp.interchouette.net/"
    }
  }
}
```

Browser agents on [interchouette.net](https://interchouette.net/) get a thin WebMCP layer (site overview, navigation, radio controls, `list_knowledge_topics`, `get_remote_mcp`). Full corpus search and document fetch stay on this remote MCP.

## Update content

1. Edit sources under **`mcp/catalog/`** (`docs.toml`, `products.toml`, optional `news/*.json`)
2. Optional news week: **`make mcp-news-snapshot`** (prefers `GET /v1/news/archive/{week}`, else live `GET /v1/news`)
3. Rebuild the committed database: **`make mcp-db`**
4. Commit `db/interchouette.db` + catalog changes, push to `dev`
5. CI publishes `interchouette/interchouette-mcp:latest`

No Postgres for MCP. The chat API may keep a Postgres news archive (`DATABASE_URL`); MCP ships selected weeks as committed JSON under `mcp/catalog/news/`. Embeddings are built only from `mcp/catalog/` (never from private ops trees).

## Tools (knowledge)

| Tool | Source |
| --- | --- |
| `search` | Hybrid FTS5 + local bag-of-words embeddings (`documents_vec`, model `hash-bow-v1`) |
| `get_doc_by_slug`, `list_knowledge_index` | DB |
| `get_itcy`, `get_contact`, `get_radio_info` | DB slugs |
| `list_shipped_products`, `list_projects_in_progress` | DB (from `products.toml`) |
| `list_news_archive`, `get_news_week` | DB (`catalog/news/YYYY-Www.json` → `news-week-*`) |
| `list_publications`, `get_publication` | Live GitHub `itcy-publications` (optional `GITHUB_TOKEN` for rate limits) |
| `get_news` | Live API `GET /v1/news` |
| `check_availability`, `book_appointment` | Chat backend calendar proxy (`CHAT_BACKEND_URL` + `MCP_CHAT_TOKEN`) |

## Resources

CV PDF/HTML, news RSS/Atom, and `.well-known/mcp.json` URLs are advertised as MCP resources (read returns a short pointer text, not a binary download).

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

Chat write tools (`send_message_to_gregory_roussac`, `get_chat_relay_status`) require `MCP_CHAT_TOKEN` plus `SLACK_BOT_TOKEN` and `GREG_SLACK_USER_ID`. `list_chat_capabilities` needs no token.

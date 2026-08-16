# Interchouette knowledge MCP

Streamable HTTP MCP. **Read-only** committed SQLite file:

**`db/knowledge.db`**

Official URL: `https://mcp.interchouette.net/interchouette`

## How to update content

1. Edit `db/knowledge.db` (DB Browser for SQLite, `sqlite3`, etc.)
2. Commit + merge to `dev`
3. CI publishes `interchouette/interchouette-mcp:latest`
4. Render redeploys

No content inserts at runtime. No Postgres.

## Images

`interchouette/interchouette-mcp:latest` — port `8080`, path `/interchouette`.

## Local

```bash
make mcp-lint mcp-test
cargo run --manifest-path backend/Cargo.toml -- --knowledge-db db/knowledge.db
```

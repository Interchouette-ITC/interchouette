# Interchouette knowledge MCP

Streamable HTTP MCP. **Read-only** committed SQLite file:

**`db/interchouette.db`**

Official URL: `https://mcp.interchouette.net/interchouette`

## How to update content

1. Edit `db/interchouette.db` (DB Browser for SQLite, `sqlite3`, etc.)
2. Commit + merge to `dev`
3. CI publishes `interchouette/interchouette-mcp:latest`
4. CI calls the Render deploy hook for the MCP service

No content inserts at runtime. No Postgres.

## Images

`interchouette/interchouette-mcp:latest` or `:dev` — port `8080`, path `/interchouette`.
Tags: **`:dev`** and **`:latest` only** (no semver tags).

## Local

```bash
make mcp-lint mcp-test
cargo run --manifest-path backend/Cargo.toml -- --knowledge-db db/interchouette.db
```

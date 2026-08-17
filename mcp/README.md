# Interchouette MCP

Read-only Streamable HTTP MCP over committed **`db/interchouette.db`**.

Official MCP URL: `https://mcp.interchouette.net/` (alias `/interchouette` kept for old clients).

## Update content

1. Edit `db/interchouette.db` (DB Browser for SQLite, `sqlite3`, etc.)
2. Commit + push to `dev`
3. CI publishes `interchouette/interchouette-mcp:latest`

No Postgres. No markdown ingest pipeline. No admin upsert API.

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

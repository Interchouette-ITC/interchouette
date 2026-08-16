# Interchouette knowledge MCP

Streamable HTTP MCP for agents. SQLite FTS5 corpus for Gregory Roussac / Interchouette.

Official URL: `https://mcp.interchouette.net/interchouette`

## Images

| Registry             | Image                                         |
| -------------------- | --------------------------------------------- |
| Docker Hub (primary) | `interchouette/interchouette-mcp`             |
| Org GHCR             | `ghcr.io/interchouette-itc/interchouette-mcp` |
| Worker GHCR          | `ghcr.io/interchouette/interchouette-mcp`     |
| Personal GHCR        | `ghcr.io/groussac/interchouette-mcp`          |

Tags: `:dev` (tip from CI), `:0.1.0` + `:latest` (release CI).

Render Web Service: pull **`interchouette/interchouette-mcp:dev`** (or `:latest`), listen **8080**, path **`/interchouette`**, disk for `/app/data`, env `ADMIN_TOKEN`, `CORS_ORIGIN=https://interchouette.net`.

## Local run

```bash
cd backend
cargo run -- --listen 127.0.0.1:8080 --data-dir ./data --knowledge-dir ../knowledge
```

```bash
make mcp-lint mcp-test
make mcp-docker-build-dev
docker run --rm -p 8080:8080 -e ADMIN_TOKEN=secret interchouette/interchouette-mcp:dev
```

Health: `GET /health`  
MCP: `/interchouette`

## Admin

- `POST /v1/admin/knowledge/reingest` with `Authorization: Bearer $ADMIN_TOKEN`
- `POST /v1/admin/knowledge?slug=…&lang=en&title=…` with markdown body

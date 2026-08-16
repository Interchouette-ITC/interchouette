# Interchouette knowledge MCP

Streamable HTTP MCP for agents. SQLite FTS5 over a **live markdown tree on disk**.

Official URL: `https://mcp.interchouette.net/interchouette`

## Update content (normal path)

Do **not** rebuild the Docker image to change copy. With a Render disk on `/app/data`:

```bash
curl -sS -X POST "https://mcp.interchouette.net/v1/admin/knowledge?slug=en/gregory-roussac&lang=en&title=Gregory%20Roussac" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: text/markdown" \
  --data-binary @knowledge/en/gregory-roussac.md
```

That writes `$DATA_DIR/knowledge/en/gregory-roussac.md` and updates SQLite/FTS immediately. Survives restarts.

`POST /v1/admin/knowledge/reingest` only rebuilds FTS from the live disk tree (ops recovery).

Image rebuilds are for **code** changes. The image `knowledge/` tree is a **first-boot seed** into `$DATA_DIR/knowledge`.

## Data layout

| Path                          | Role                             |
| ----------------------------- | -------------------------------- |
| `$DATA_DIR/knowledge/**/*.md` | Source of truth (on Render disk) |
| `$DATA_DIR/knowledge.sqlite`  | FTS5 index                       |
| `$DATA_DIR/bot.sqlite`        | Chat stub                        |

Default `DATA_DIR=/app/data`.

## Images

| Registry             | Image                                         |
| -------------------- | --------------------------------------------- |
| Docker Hub (primary) | `interchouette/interchouette-mcp`             |
| Org GHCR             | `ghcr.io/interchouette-itc/interchouette-mcp` |
| Worker GHCR          | `ghcr.io/interchouette/interchouette-mcp`     |
| Personal GHCR        | `ghcr.io/groussac/interchouette-mcp`          |

Tags: `:dev` (tip from CI), `:0.1.1` + `:latest` (release CI).

Render: **`interchouette/interchouette-mcp:latest`**, port **8080**, path **`/interchouette`**, disk **`/app/data`**, env `ADMIN_TOKEN`, `CORS_ORIGIN=https://interchouette.net`.

## Local

```bash
make mcp-lint mcp-test
make mcp-docker-build-dev
docker run --rm -p 8080:8080 -e ADMIN_TOKEN=secret -v "$PWD/data:/app/data" interchouette/interchouette-mcp:dev
```

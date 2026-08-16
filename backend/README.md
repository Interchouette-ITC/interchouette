# Interchouette knowledge MCP

Streamable HTTP MCP for agents. **Read-only** corpus: markdown in git, SQLite FTS is a derived index.

Official URL: `https://mcp.interchouette.net/interchouette`

## How to update content

Same idea as shipping config/content in git elsewhere: edit files, push, new image.

1. Edit `knowledge/**/*.md` in this repo
2. Merge to `dev` → CI publishes `interchouette/interchouette-mcp:latest`
3. Render redeploys → boot rebuilds the FTS index from the image tree

Nothing is inserted by hand into SQLite. The DB is rebuilt from the committed markdown on every start.

Optional ops: `POST /v1/admin/knowledge/reingest` with `ADMIN_TOKEN` re-reads the image tree without a full restart.

## No Postgres

Do not add Render Postgres. Git markdown + derived SQLite FTS is enough.

## Data layout

| Path                         | Role                               |
| ---------------------------- | ---------------------------------- |
| `/app/knowledge/**/*.md`     | Source of truth (from git / image) |
| `$DATA_DIR/knowledge.sqlite` | Derived FTS index (ephemeral OK)   |
| `$DATA_DIR/bot.sqlite`       | Chat stub only                     |

Default `DATA_DIR=/app/data`. A disk is optional for knowledge (index rebuilds from the image). Use a disk later only if chat state must survive.

## Images

| Registry   | Image                                         |
| ---------- | --------------------------------------------- |
| Docker Hub | `interchouette/interchouette-mcp:latest`      |
| Org GHCR   | `ghcr.io/interchouette-itc/interchouette-mcp` |

Render: **`interchouette/interchouette-mcp:latest`**, port **8080**, path **`/interchouette`**, env `CORS_ORIGIN=https://interchouette.net` (and `ADMIN_TOKEN` if you want reingest).

## Local

```bash
make mcp-lint mcp-test
make mcp-docker-build-dev
docker run --rm -p 8080:8080 interchouette/interchouette-mcp:dev
```

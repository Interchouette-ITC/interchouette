# News week snapshots

JSON files named `YYYY-Www.json` (ISO week). Each file is a `GET /v1/news` (or
`/v1/news/archive/{week}`) payload.

```bash
make mcp-news-snapshot
cd mcp && cargo run --bin interchouette-mcp-news-snapshot -- --week 2026-W34
make mcp-db
```

MCP tools: `list_news_archive`, `get_news_week`. Live posts stay on `get_news`.

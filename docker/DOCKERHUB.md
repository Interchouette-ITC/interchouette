# interchouette-mcp

Streamable HTTP MCP server for Interchouette ITC / Gregory Roussac.

## Endpoint

- **Production**: https://mcp.interchouette.net/
- **WebMCP explorer**: https://mcp.interchouette.net/
- Port: 8080, path: `/`

## Tools

### Knowledge (no auth)

| Tool                          | Description                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `search`                      | Hybrid FTS + local embedding search over Interchouette / Gregory Roussac content |
| `get_interchouette_overview`  | Company overview (en / nl / fr)                                                  |
| `get_gregory_roussac_profile` | Profile of Gregory Roussac                                                       |
| `get_gregory_roussac_cv`      | CV summary with HTML/PDF links                                                   |
| `get_contact`                 | Contact channels                                                                 |
| `get_itcy`                    | ITCy persona (disclosed AI mascot / operator)                                    |
| `list_shipped_products`       | Shipped and beta products                                                        |
| `list_projects_in_progress`   | In-progress projects                                                             |
| `get_radio_info`              | SoundCloud Play ITC radio metadata and URLs                                      |
| `get_doc_by_slug`             | One knowledge document by slug                                                   |
| `list_knowledge_index`        | Knowledge slugs, languages, and titles                                           |
| `list_public_projects`        | Legacy public project blurbs (prefer shipped / wip tools)                        |

### News and publications (no auth)

| Tool                | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `get_news`          | Live LinkedIn and X posts from api.interchouette.net  |
| `list_news_archive` | Committed ISO-week news snapshots in the MCP database |
| `get_news_week`     | One committed news-week snapshot (e.g. `2026-W34`)    |
| `list_publications` | Live ITCy publication artefacts from GitHub           |
| `get_publication`   | One publication body by artefact id                   |

### Chat and calendar (`MCP_CHAT_TOKEN`)

| Tool                              | Description                                                |
| --------------------------------- | ---------------------------------------------------------- |
| `list_chat_capabilities`          | Lists token-required tools (no token needed for this help) |
| `get_chat_relay_status`           | Relay status                                               |
| `send_message_to_gregory_roussac` | Post a free-form message to Gregory Roussac                |
| `check_availability`              | Calendar busy intervals for a time window                  |
| `book_appointment`                | Book a meeting (name, email, start time)                   |

`token` = `MCP_CHAT_TOKEN` env var on the server. Visitors without a token can use the chat widget at https://interchouette.net/.

## Quick start

```json
{
  "mcpServers": {
    "interchouette": {
      "type": "streamable-http",
      "url": "https://mcp.interchouette.net/"
    }
  }
}
```

Tags: `dev` and `latest` only.

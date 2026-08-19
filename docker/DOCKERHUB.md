# interchouette-mcp

Streamable HTTP MCP server for Interchouette ITC / Gregory Roussac.

Content is the committed SQLite file `db/interchouette.db` (read-only at runtime).

## Endpoint

- **Production**: https://mcp.interchouette.net/
- **WebMCP explorer**: https://mcp.interchouette.net/
- Port: 8080, path: `/`

## Tools

| Tool | Auth | Description |
| --- | --- | --- |
| `search` | none | Full-text search over Gregory Roussac / Interchouette content |
| `get_interchouette_overview` | none | Company overview (en / nl / fr) |
| `get_gregory_profile` | none | Profile of Gregory Roussac |
| `get_cv_summary` | none | CV summary with HTML/PDF links |
| `list_public_projects` | none | Public project catalog |
| `get_contact` | none | Contact channels and booking links |
| `list_chat_capabilities` | none | Lists token-required tools |
| `get_chat_relay_status` | token | Slack relay status |
| `send_message_to_greg` | token | Post a free-form DM to Greg via Slack |
| `book_appointment` | token | Request a 90-min meeting (name, email, start time) |

`token` = `MCP_CHAT_TOKEN` env var on the server.

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

//! Format live / archived news JSON for MCP documents and tools.

use std::fmt::Write as _;

use chrono::{DateTime, Utc};
use serde_json::Value;

/// ISO week id `YYYY-Www` from an RFC3339 `fetched_at` (UTC).
#[must_use]
pub fn week_id_from_fetched_at(fetched_at: &str) -> Option<String> {
    let dt = DateTime::parse_from_rfc3339(fetched_at)
        .ok()?
        .with_timezone(&Utc);
    Some(dt.format("%G-W%V").to_string())
}

/// Validate `YYYY-Www` shape (same rules as the chat news archive API).
#[must_use]
pub const fn is_valid_week_id(week_id: &str) -> bool {
    let bytes = week_id.as_bytes();
    if bytes.len() != 8 {
        return false;
    }
    bytes[0].is_ascii_digit()
        && bytes[1].is_ascii_digit()
        && bytes[2].is_ascii_digit()
        && bytes[3].is_ascii_digit()
        && bytes[4] == b'-'
        && bytes[5] == b'W'
        && bytes[6].is_ascii_digit()
        && bytes[7].is_ascii_digit()
}

/// MCP document slug for an archived ISO week.
#[must_use]
pub fn news_week_slug(week_id: &str) -> String {
    format!("news-week-{week_id}")
}

/// Parse `news-week-YYYY-Www` → `YYYY-Www`.
#[must_use]
pub fn week_id_from_slug(slug: &str) -> Option<&str> {
    slug.strip_prefix("news-week-")
        .filter(|w| is_valid_week_id(w))
}

/// Human-readable body for live `get_news` (and archive docs).
#[must_use]
pub fn format_news_snapshot(body: &Value) -> String {
    let mut out = String::from(
        "Interchouette News (API cache, about every 4 hours)\n\
         Page: https://interchouette.net/news\n\
         JSON: https://api.interchouette.net/v1/news\n\
         RSS: https://api.interchouette.net/v1/news/rss.xml\n\
         Atom: https://api.interchouette.net/v1/news/atom.xml\n",
    );
    if let Some(at) = body.get("fetched_at").and_then(Value::as_str) {
        let _ = writeln!(out, "Fetched at: {at}");
    }
    if let Some(ttl) = body.get("cache_ttl_secs").and_then(Value::as_u64) {
        let _ = writeln!(out, "Cache TTL seconds: {ttl}");
    }
    out.push('\n');
    let sections = [
        ("Interchouette on X", "itc_x"),
        ("Interchouette on LinkedIn", "itc_linkedin"),
    ];
    for (label, key) in sections {
        let _ = writeln!(out, "## {label}");
        let items = body
            .pointer(&format!("/feeds/{key}/items"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if items.is_empty() {
            out.push_str("(no posts)\n\n");
            continue;
        }
        for item in items {
            let text = item.get("text").and_then(Value::as_str).unwrap_or("");
            let url = item.get("url").and_then(Value::as_str).unwrap_or("");
            let when = item
                .get("published_at")
                .and_then(Value::as_str)
                .unwrap_or("");
            if when.is_empty() {
                let _ = writeln!(out, "- {text}");
            } else {
                let _ = writeln!(out, "- {text} ({when})");
            }
            if !url.is_empty() {
                let _ = writeln!(out, "  {url}");
            }
        }
        out.push('\n');
    }
    out.trim_end().to_string()
}

/// Markdown body stored under slug `news-week-{week_id}`.
#[must_use]
pub fn format_news_week_doc(week_id: &str, body: &Value) -> String {
    let mut out = format!(
        "ISO week `{week_id}` news snapshot (committed MCP corpus).\n\
         Live feed: GET /v1/news. API archive (Postgres when configured): \
         GET /v1/news/archive/{week_id}.\n\n"
    );
    out.push_str(&format_news_snapshot(body));
    out
}

/// Current UTC ISO week id (`YYYY-Www`).
#[must_use]
pub fn current_iso_week_id() -> String {
    Utc::now().format("%G-W%V").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn week_id_uses_iso_week() {
        assert_eq!(
            week_id_from_fetched_at("2026-08-21T12:00:00Z").as_deref(),
            Some("2026-W34")
        );
    }

    #[test]
    fn week_id_rejects_garbage() {
        assert!(week_id_from_fetched_at("not-a-date").is_none());
    }

    #[test]
    fn validates_week_id_shape() {
        assert!(is_valid_week_id("2026-W34"));
        assert!(!is_valid_week_id("2026-W3"));
        assert!(!is_valid_week_id("2026-w34"));
        assert!(!is_valid_week_id("../etc"));
    }

    #[test]
    fn slug_roundtrip() {
        assert_eq!(news_week_slug("2026-W34"), "news-week-2026-W34");
        assert_eq!(week_id_from_slug("news-week-2026-W34"), Some("2026-W34"));
        assert!(week_id_from_slug("itcy").is_none());
    }

    #[test]
    fn formats_snapshot_posts() {
        let text = format_news_snapshot(&json!({
            "fetched_at": "2026-08-20T12:00:00.000Z",
            "feeds": {
                "itc_x": {
                    "items": [{ "text": "Hello X", "url": "https://x.com/a", "published_at": "2026-08-19" }]
                },
                "itc_linkedin": { "items": [] }
            }
        }));
        assert!(text.contains("Hello X"));
        assert!(text.contains("https://api.interchouette.net/v1/news"));
    }
}

//! RSS 2.0 and Atom 1.0 bodies from a [`NewsResponse`].

use std::fmt::Write as _;

use crate::news::types::{NewsItem, NewsResponse};

const SITE: &str = "https://interchouette.net";
const API: &str = "https://api.interchouette.net";

struct FeedEntry {
    id: String,
    title: String,
    text: String,
    url: String,
    published_at: Option<String>,
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn collect_entries(response: &NewsResponse) -> Vec<FeedEntry> {
    let mut entries = Vec::new();
    for (source, feed) in [
        ("Interchouette on X", &response.feeds.itc_x),
        ("Interchouette on LinkedIn", &response.feeds.itc_linkedin),
    ] {
        for item in &feed.items {
            entries.push(entry_from_item(source, item));
        }
    }
    entries.sort_by(|a, b| {
        let ta = a
            .published_at
            .as_deref()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map_or(0, |d| d.timestamp());
        let tb = b
            .published_at
            .as_deref()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map_or(0, |d| d.timestamp());
        tb.cmp(&ta)
    });
    entries
}

fn entry_from_item(source: &str, item: &NewsItem) -> FeedEntry {
    let snippet: String = item
        .text
        .split_whitespace()
        .take(12)
        .collect::<Vec<_>>()
        .join(" ");
    let title = if snippet.is_empty() {
        format!("{source}: {}", item.id)
    } else {
        let short: String = snippet.chars().take(80).collect();
        format!("{source}: {short}")
    };
    FeedEntry {
        id: item.id.clone(),
        title,
        text: item.text.clone(),
        url: if item.url.is_empty() {
            format!("{SITE}/news")
        } else {
            item.url.clone()
        },
        published_at: item.published_at.clone(),
    }
}

/// RSS 2.0 document for the Interchouette news channel.
#[must_use]
pub fn build_rss(response: &NewsResponse) -> String {
    let last_build = xml_escape(&response.fetched_at);
    let mut body = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Interchouette News</title>
    <link>{SITE}/news</link>
    <description>ITC LinkedIn and X posts from Interchouette</description>
    <language>en</language>
    <lastBuildDate>{last_build}</lastBuildDate>
"#
    );
    for item in collect_entries(response) {
        let pub_date = item
            .published_at
            .as_deref()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|d| format!("\n      <pubDate>{}</pubDate>", xml_escape(&d.to_rfc2822())))
            .unwrap_or_default();
        let _ = write!(
            body,
            r#"    <item>
      <title>{}</title>
      <link>{}</link>
      <guid isPermaLink="false">{}</guid>
      <description>{}</description>{pub_date}
    </item>
"#,
            xml_escape(&item.title),
            xml_escape(&item.url),
            xml_escape(&item.id),
            xml_escape(&item.text),
        );
    }
    body.push_str("  </channel>\n</rss>\n");
    body
}

/// Atom 1.0 document for the Interchouette news feed.
#[must_use]
pub fn build_atom(response: &NewsResponse) -> String {
    let updated = xml_escape(&response.fetched_at);
    let mut body = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Interchouette News</title>
  <link href="{SITE}/news" rel="alternate" type="text/html"/>
  <link href="{API}/v1/news/atom.xml" rel="self" type="application/atom+xml"/>
  <id>{SITE}/news</id>
  <updated>{updated}</updated>
"#
    );
    for item in collect_entries(response) {
        let when = xml_escape(
            item.published_at
                .as_deref()
                .unwrap_or(response.fetched_at.as_str()),
        );
        let _ = write!(
            body,
            r#"  <entry>
    <title>{}</title>
    <link href="{}" rel="alternate" type="text/html"/>
    <id>{}</id>
    <updated>{when}</updated>
    <summary>{}</summary>
  </entry>
"#,
            xml_escape(&item.title),
            xml_escape(&item.url),
            xml_escape(&item.id),
            xml_escape(&item.text),
        );
    }
    body.push_str("</feed>\n");
    body
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::news::types::{NewsFeed, NewsFeeds, NewsItem};

    fn sample() -> NewsResponse {
        NewsResponse {
            fetched_at: "2026-08-20T12:00:00+00:00".into(),
            cache_ttl_secs: 14400,
            feeds: NewsFeeds {
                itc_linkedin: NewsFeed {
                    items: vec![],
                    profile_url: "https://linkedin.com".into(),
                    error: None,
                },
                itc_x: NewsFeed {
                    items: vec![NewsItem {
                        id: "x1".into(),
                        text: "Hello & welcome <here>".into(),
                        url: "https://x.com/a".into(),
                        published_at: Some("2026-08-19T10:00:00+00:00".into()),
                    }],
                    profile_url: "https://x.com/interchouette".into(),
                    error: None,
                },
            },
        }
    }

    #[test]
    fn rss_escapes_and_lists_items() {
        let xml = build_rss(&sample());
        assert!(xml.contains("<rss version=\"2.0\">"));
        assert!(xml.contains("Hello &amp; welcome &lt;here&gt;"));
        assert!(xml.contains("<guid isPermaLink=\"false\">x1</guid>"));
    }

    #[test]
    fn atom_self_link_points_at_api() {
        let xml = build_atom(&sample());
        assert!(xml.contains("https://api.interchouette.net/v1/news/atom.xml"));
        assert!(xml.contains("Hello &amp; welcome &lt;here&gt;"));
    }
}

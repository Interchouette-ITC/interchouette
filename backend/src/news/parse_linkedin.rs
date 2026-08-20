//! Parse `LinkedIn` activity HTML into news items.

use std::collections::HashSet;

use html_escape::decode_html_entities;
use regex::Regex;
use scraper::{Html, Selector};
use serde_json::Value;

use super::types::NewsItem;

const ACTIVITY_URN_RE: &str = r"urn:li:activity:(\d+)";
const CODE_BLOCK_RE: &str = r"(?s)<code[^>]*>(.*?)</code>";

/// Returns true when `LinkedIn` returned an authwall or login checkpoint.
#[must_use]
pub fn is_linkedin_authwall(html: &str) -> bool {
    let lower = html.to_ascii_lowercase();
    lower.contains("authwall")
        || lower.contains("d_checkpoint_lg_consumer_login")
        || (lower.contains("sessionredirect=") && lower.contains("linkedin.com/authwall"))
}

/// Extract posts from a `LinkedIn` profile shares or company posts page.
#[must_use]
pub fn parse_linkedin(html: &str, profile_url: &str, limit: usize) -> Vec<NewsItem> {
    if is_linkedin_authwall(html) {
        return vec![];
    }
    let document = Html::parse_document(html);
    let mut items = parse_linkedin_dom(&document);
    if items.is_empty() {
        items = parse_linkedin_embedded_json(html);
    }
    items.retain(|item| !item.text.trim().is_empty());
    items.truncate(limit);
    let _ = profile_url;
    items
}

fn parse_linkedin_dom(document: &Html) -> Vec<NewsItem> {
    let selectors = [
        "[data-urn^=\"urn:li:activity:\"]",
        ".feed-shared-update-v2",
        "article[data-activity-urn]",
    ];
    let text_selectors = [
        ".update-components-text",
        ".feed-shared-text",
        ".break-words",
        "span[dir=\"ltr\"]",
    ];
    let text_selector_list: Vec<Selector> = text_selectors
        .iter()
        .filter_map(|s| Selector::parse(s).ok())
        .collect();
    let time_selector = Selector::parse("time[datetime]").ok();
    let mut seen = HashSet::new();
    let mut items = Vec::new();

    for sel_str in selectors {
        let Ok(container_sel) = Selector::parse(sel_str) else {
            continue;
        };
        for node in document.select(&container_sel) {
            let fragment = node.html();
            let Some(id) = extract_activity_id(&fragment) else {
                continue;
            };
            if !seen.insert(id.clone()) {
                continue;
            }
            let text = text_selector_list
                .iter()
                .flat_map(|sel| node.select(sel))
                .map(|el| el.text().collect::<String>())
                .map(|t| t.trim().to_string())
                .find(|t| !t.is_empty())
                .unwrap_or_default();
            if text.is_empty() {
                continue;
            }
            let published_at = time_selector
                .as_ref()
                .and_then(|sel| node.select(sel).next())
                .and_then(|el| el.value().attr("datetime"))
                .map(str::to_string);
            items.push(NewsItem {
                id: id.clone(),
                text,
                url: linkedin_post_url(&id),
                published_at,
            });
        }
    }
    items
}

fn parse_linkedin_embedded_json(html: &str) -> Vec<NewsItem> {
    let re = regex_from(CODE_BLOCK_RE);
    let mut seen = HashSet::new();
    let mut items = Vec::new();
    for cap in re.captures_iter(html) {
        let raw = decode_html_entities(cap.get(1).map_or("", |m| m.as_str()));
        let Ok(value) = serde_json::from_str::<Value>(raw.trim()) else {
            continue;
        };
        collect_json_updates(&value, &mut items, &mut seen);
    }
    items
}

fn collect_json_updates(value: &Value, items: &mut Vec<NewsItem>, seen: &mut HashSet<String>) {
    match value {
        Value::Object(map) => {
            if let Some(item) = update_from_object(map) {
                if seen.insert(item.id.clone()) {
                    items.push(item);
                }
            }
            for child in map.values() {
                collect_json_updates(child, items, seen);
            }
        }
        Value::Array(list) => {
            for child in list {
                collect_json_updates(child, items, seen);
            }
        }
        _ => {}
    }
}

fn update_from_object(map: &serde_json::Map<String, Value>) -> Option<NewsItem> {
    let metadata = map.get("metadata")?.as_object()?;
    if metadata.get("actionsPosition").and_then(Value::as_str) != Some("ACTOR_COMPONENT") {
        return None;
    }
    let activity_id = metadata
        .get("backendUrn")
        .and_then(Value::as_str)
        .and_then(extract_activity_id)
        .or_else(|| {
            map.get("entityUrn")
                .and_then(Value::as_str)
                .and_then(extract_activity_id)
        })
        .or_else(|| {
            map.values()
                .find_map(|value| value.as_str().and_then(extract_activity_id))
        })?;
    let text = map
        .get("commentary")
        .and_then(commentary_text)
        .or_else(|| map.get("commentaryText").and_then(commentary_text))
        .unwrap_or_default();
    if text.is_empty() {
        return None;
    }
    let published_at = map
        .get("createdAt")
        .and_then(json_timestamp)
        .or_else(|| map.get("created").and_then(json_timestamp));
    let url = map
        .get("socialContent")
        .and_then(|value| value.get("shareUrl"))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map_or_else(|| linkedin_post_url(&activity_id), str::to_string);
    Some(NewsItem {
        id: activity_id,
        text,
        url,
        published_at,
    })
}

fn commentary_text(value: &Value) -> Option<String> {
    if let Some(text) = value
        .get("text")
        .and_then(|inner| inner.get("text"))
        .and_then(Value::as_str)
    {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    if let Some(text) = value.as_str() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    None
}

fn json_timestamp(value: &Value) -> Option<String> {
    let millis = value.as_i64()?;
    let secs = millis / 1000;
    chrono::DateTime::from_timestamp(secs, 0).map(|dt| dt.to_rfc3339())
}

fn extract_activity_id(fragment: &str) -> Option<String> {
    regex_from(ACTIVITY_URN_RE)
        .captures(fragment)
        .map(|cap| cap[1].to_string())
        .filter(|id| !id.is_empty())
}

fn linkedin_post_url(activity_id: &str) -> String {
    format!("https://www.linkedin.com/feed/update/urn:li:activity:{activity_id}/")
}

fn regex_from(pattern: &str) -> Regex {
    Regex::new(pattern).unwrap_or_else(|_| Regex::new("$^").expect("valid regex"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_authwall_html() {
        let html = include_str!("fixtures/linkedin_authwall.html");
        assert!(is_linkedin_authwall(html));
    }

    #[test]
    fn parses_greg_shares_fixture() {
        let html = include_str!("fixtures/linkedin_greg_shares.html");
        let items = parse_linkedin(html, "https://www.linkedin.com/in/gregoryroussac/", 8);
        assert_eq!(items.len(), 2);
        assert!(items[0].text.contains("Rust MCP"));
        assert!(items[0].url.contains("urn:li:activity:1001"));
        assert_eq!(
            items[0].published_at.as_deref(),
            Some("2026-08-15T09:00:00.000Z")
        );
    }

    #[test]
    fn parses_company_posts_fixture() {
        let html = include_str!("fixtures/linkedin_itc_company.html");
        let items = parse_linkedin(
            html,
            "https://www.linkedin.com/company/interchouette-itc/posts/",
            8,
        );
        assert_eq!(items.len(), 1);
        assert!(items[0].text.contains("Interchouette ITC"));
    }

    #[test]
    fn parses_embedded_json_code_block() {
        let html = r#"<html><body><code>{"metadata":{"actionsPosition":"ACTOR_COMPONENT","backendUrn":"urn:li:activity:9001"},"entityUrn":"urn:li:fsd_update:(urn:li:activity:9001,FEED,)","commentary":{"text":{"text":"Hello from ITCy on LinkedIn."}},"createdAt":1755600000000}</code></body></html>"#;
        let items = parse_linkedin(html, "https://example.com", 8);
        assert_eq!(items.len(), 1);
        assert!(items[0].text.contains("ITCy"));
        assert!(items[0].url.contains("9001"));
    }

    #[test]
    fn skips_reposted_company_feed_items() {
        let html = r#"<html><body>
<code>{"metadata":{"actionsPosition":"ACTOR_COMPONENT","backendUrn":"urn:li:activity:9001"},"entityUrn":"urn:li:fsd_update:(urn:li:activity:9001,FEED,)","commentary":{"text":{"text":"Original ITC post."}}}</code>
<code>{"metadata":{"actionsPosition":"HEADER_COMPONENT","backendUrn":"urn:li:activity:9002"},"entityUrn":"urn:li:fsd_update:(urn:li:activity:9002,FEED,)","commentary":{"text":{"text":"Reposted Casper promo."}}}</code>
</body></html>"#;
        let items = parse_linkedin(html, "https://example.com", 8);
        assert_eq!(items.len(), 1);
        assert!(items[0].text.contains("Original ITC"));
    }
}

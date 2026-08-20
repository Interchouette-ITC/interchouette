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
                .map(|el| element_markdown(el))
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
    if let Some(attributed) = value.get("text").and_then(Value::as_object) {
        let raw = attributed.get("text").and_then(Value::as_str)?;
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return None;
        }
        let attrs = match attributed
            .get("attributesV2")
            .or_else(|| attributed.get("attributes"))
            .and_then(Value::as_array)
        {
            Some(list) => list.as_slice(),
            None => &[],
        };
        return Some(apply_text_hyperlinks(trimmed, attrs));
    }
    if let Some(text) = value.as_str() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    None
}

/// Rewrite `LinkedIn` attributed spans that carry a `hyperlink` as markdown links.
///
/// `LinkedIn` indexes `start` / `length` in Unicode scalar values (same as Rust `char`s).
/// Duplicate attributes for the same span (company urn + hyperlink) are collapsed to the
/// hyperlink URL.
fn apply_text_hyperlinks(text: &str, attrs: &[Value]) -> String {
    let mut spans: Vec<(usize, usize, String)> = Vec::new();
    for attr in attrs {
        let Some(start) = attr
            .get("start")
            .and_then(Value::as_u64)
            .and_then(|n| usize::try_from(n).ok())
        else {
            continue;
        };
        let Some(length) = attr
            .get("length")
            .and_then(Value::as_u64)
            .and_then(|n| usize::try_from(n).ok())
        else {
            continue;
        };
        if length == 0 {
            continue;
        }
        let Some(href) = attribute_hyperlink(attr) else {
            continue;
        };
        if let Some((_, _, existing)) = spans
            .iter_mut()
            .find(|(s, l, _)| *s == start && *l == length)
        {
            *existing = href;
        } else {
            spans.push((start, length, href));
        }
    }
    if spans.is_empty() {
        return text.to_string();
    }
    spans.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)));
    let mut chars: Vec<char> = text.chars().collect();
    for (start, length, href) in spans {
        let end = match start.checked_add(length) {
            Some(end) if end <= chars.len() => end,
            _ => continue,
        };
        let label: String = chars[start..end].iter().collect();
        let markdown = format!("[{}]({})", escape_markdown_label(&label), href);
        chars.splice(start..end, markdown.chars());
    }
    chars.into_iter().collect()
}

fn attribute_hyperlink(attr: &Value) -> Option<String> {
    let detail = attr.get("detailData")?;
    for key in ["hyperlink", "textLink", "hyperlinkOpenExternally"] {
        if let Some(href) = detail.get(key).and_then(Value::as_str) {
            let trimmed = href.trim();
            if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn escape_markdown_label(label: &str) -> String {
    label.replace('\\', "\\\\").replace(']', "\\]")
}

/// Collect visible text from a feed DOM node, preserving `<a href>` as markdown links.
fn element_markdown(el: scraper::ElementRef<'_>) -> String {
    let mut out = String::new();
    append_node_markdown(el, &mut out);
    out
}

fn append_node_markdown(el: scraper::ElementRef<'_>, out: &mut String) {
    use std::fmt::Write as _;

    for child in el.children() {
        if let Some(elem) = scraper::ElementRef::wrap(child) {
            if elem.value().name() == "a" {
                let href = elem
                    .value()
                    .attr("href")
                    .filter(|h| h.starts_with("http://") || h.starts_with("https://"));
                let label = elem.text().collect::<String>();
                let label = label.trim();
                if let Some(href) = href {
                    if label.is_empty() {
                        out.push_str(href);
                    } else {
                        let _ = write!(out, "[{}]({})", escape_markdown_label(label), href);
                    }
                    continue;
                }
            }
            append_node_markdown(elem, out);
        } else if let Some(text) = child.value().as_text() {
            out.push_str(text);
        }
    }
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
    fn applies_company_mention_hyperlink_as_markdown() {
        let html = r#"<html><body><code>{"metadata":{"actionsPosition":"ACTOR_COMPONENT","backendUrn":"urn:li:activity:7496"},"entityUrn":"urn:li:fsd_update:(urn:li:activity:7496,FEED,)","commentary":{"text":{"text":"WebMCP infancy. Interchouette - ITC has taken a step.","attributesV2":[{"start":16,"length":19,"detailData":{"*companyName":"urn:li:fsd_company:91634202","hyperlink":null}},{"start":16,"length":19,"detailData":{"hyperlink":"https://www.linkedin.com/company/interchouette-itc/"}}]}},"createdAt":1755600000000}</code></body></html>"#;
        let items = parse_linkedin(html, "https://example.com", 8);
        assert_eq!(items.len(), 1);
        assert!(
            items[0].text.contains(
                "[Interchouette - ITC](https://www.linkedin.com/company/interchouette-itc/)"
            ),
            "got: {}",
            items[0].text
        );
        assert!(!items[0].text.contains("](null)"));
    }

    #[test]
    fn applies_mentions_with_emoji_using_unicode_indices() {
        let html = include_str!("fixtures/linkedin_itc_mentions.html");
        let items = parse_linkedin(html, "https://example.com", 8);
        assert_eq!(items.len(), 1);
        let text = &items[0].text;
        assert!(text.contains('\u{1F989}'), "emoji missing: {text}");
        assert!(
            text.contains(
                "[Interchouette - ITC](https://www.linkedin.com/company/interchouette-itc/)"
            ),
            "mention missing: {text}"
        );
        assert!(
            !text.contains("[ Interchouette") && !text.contains("IT](https://"),
            "shifted mention: {text}"
        );
    }

    #[test]
    fn preserves_dom_anchor_as_markdown() {
        let html = r#"<html><body>
<div data-urn="urn:li:activity:1001">
  <div class="update-components-text">Shipped with <a href="https://www.linkedin.com/company/interchouette-itc/">Interchouette - ITC</a> today.</div>
</div>
</body></html>"#;
        let items = parse_linkedin(html, "https://example.com", 8);
        assert_eq!(items.len(), 1);
        assert!(
            items[0].text.contains(
                "[Interchouette - ITC](https://www.linkedin.com/company/interchouette-itc/)"
            ),
            "got: {}",
            items[0].text
        );
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

//! Parse X (Twitter) profile timeline HTML into news items.

use html_escape::decode_html_entities;
use scraper::{Html, Selector};
use serde_json::Value;

use super::types::NewsItem;

const STATUS_PATH_RE: &str = r"/Interchouette/status/(\d+)";
const SCHEMA_POSTING: &str = "https://schema.org/SocialMediaPosting";

/// Extract timeline posts from an X profile page. Skips the first item (pinned).
#[must_use]
pub fn parse_x(html: &str, profile_url: &str, limit: usize) -> Vec<NewsItem> {
    if let Some(mut items) = parse_x_relay(html) {
        for item in &mut items {
            item.ensure_published_at_from_id("x");
        }
        super::types::sort_news_items_newest_first(&mut items);
        items.truncate(limit);
        return items;
    }

    let document = Html::parse_document(html);
    let mut items = parse_x_schema(&document);
    if items.is_empty() {
        items = parse_x_dom_legacy(&document, profile_url);
    }
    if items.is_empty() {
        items = parse_x_embedded(html);
    }
    if items.is_empty() {
        items = parse_x_regex(html, profile_url);
    }
    items.retain(|item| !item.text.trim().is_empty());
    if items.len() > 1 {
        items.remove(0);
    } else {
        items.clear();
    }
    for item in &mut items {
        item.ensure_published_at_from_id("x");
    }
    super::types::sort_news_items_newest_first(&mut items);
    items.truncate(limit);
    items
}

fn parse_x_relay(html: &str) -> Option<Vec<NewsItem>> {
    let strings = regex::Regex::new(r#""(?:\\.|[^"\\])*""#).expect("valid string regex");
    for candidate in strings.find_iter(html) {
        let raw = candidate.as_str();
        if !raw.contains("profile_user_originals_timeline") {
            continue;
        }
        let Ok(payload) = serde_json::from_str::<String>(raw) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&payload) else {
            continue;
        };
        let Some(instructions) = value
            .pointer("/data/user_result_by_screen_name/result/profile_user_originals_timeline/timeline/instructions")
            .and_then(Value::as_array)
        else {
            continue;
        };
        let mut pinned = std::collections::HashSet::new();
        for instruction in instructions {
            if instruction.get("__typename").and_then(Value::as_str) == Some("TimelinePinEntry")
                && let Some(id) = instruction
                    .pointer("/entry/content/content/tweet_results/result/rest_id")
                    .and_then(Value::as_str)
            {
                pinned.insert(id.to_owned());
            }
        }
        let mut seen = std::collections::HashSet::new();
        let mut items = Vec::new();
        for instruction in instructions {
            if instruction.get("__typename").and_then(Value::as_str) != Some("TimelineAddEntries") {
                continue;
            }
            let Some(entries) = instruction.get("entries").and_then(Value::as_array) else {
                continue;
            };
            for entry in entries {
                let Some(tweet) = entry.pointer("/content/content/tweet_results/result") else {
                    continue;
                };
                let Some(id) = tweet.get("rest_id").and_then(Value::as_str) else {
                    continue;
                };
                if id.is_empty()
                    || !id.bytes().all(|byte| byte.is_ascii_digit())
                    || pinned.contains(id)
                    || !seen.insert(id.to_owned())
                {
                    continue;
                }
                let Some(text) = tweet
                    .pointer("/details/full_text")
                    .and_then(Value::as_str)
                    .filter(|text| !text.trim().is_empty())
                else {
                    continue;
                };
                items.push(NewsItem {
                    id: id.to_owned(),
                    text: text.to_owned(),
                    url: format!("https://x.com/Interchouette/status/{id}"),
                    published_at: None,
                });
            }
        }
        return Some(items);
    }
    None
}

fn parse_x_schema(document: &Html) -> Vec<NewsItem> {
    let Ok(article_sel) = Selector::parse(&format!("article[itemtype=\"{SCHEMA_POSTING}\"]"))
    else {
        return vec![];
    };
    let Ok(id_sel) = Selector::parse("meta[itemprop=\"identifier\"]") else {
        return vec![];
    };
    let Ok(date_sel) = Selector::parse("meta[itemprop=\"datePublished\"]") else {
        return vec![];
    };
    let Ok(url_sel) = Selector::parse("meta[itemprop=\"url\"]") else {
        return vec![];
    };
    let Ok(text_sel) = Selector::parse("meta[itemprop=\"text\"]") else {
        return vec![];
    };

    let mut items = Vec::new();
    for article in document.select(&article_sel) {
        let Some(id) = article
            .select(&id_sel)
            .next()
            .and_then(|el| el.value().attr("content"))
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let text = article
            .select(&text_sel)
            .next()
            .and_then(|el| el.value().attr("content"))
            .map(decode_html_entities)
            .map_or_default(|value| value.trim().to_string());
        if text.is_empty() {
            continue;
        }
        let published_at = article
            .select(&date_sel)
            .next()
            .and_then(|el| el.value().attr("content"))
            .map(str::to_string);
        let url = article
            .select(&url_sel)
            .next()
            .and_then(|el| el.value().attr("content"))
            .filter(|value| !value.is_empty())
            .map_or_else(
                || format!("https://x.com/Interchouette/status/{id}"),
                str::to_string,
            );
        items.push(NewsItem {
            id: id.to_string(),
            text,
            url,
            published_at,
        });
    }
    items
}

fn parse_x_dom_legacy(document: &Html, profile_url: &str) -> Vec<NewsItem> {
    let Ok(article_sel) = Selector::parse("article[data-testid=\"tweet\"]") else {
        return vec![];
    };
    let Ok(text_sel) = Selector::parse("[data-testid=\"tweetText\"]") else {
        return vec![];
    };
    let Ok(time_sel) = Selector::parse("time[datetime]") else {
        return vec![];
    };
    let Ok(link_sel) = Selector::parse("a[href*=\"/status/\"]") else {
        return vec![];
    };

    let mut items = Vec::new();
    for article in document.select(&article_sel) {
        let text = article
            .select(&text_sel)
            .map(|el| el.text().collect::<String>())
            .map(|t| t.trim().to_string())
            .find(|t| !t.is_empty())
            .unwrap_or_default();
        if text.is_empty() {
            continue;
        }
        let published_at = article
            .select(&time_sel)
            .next()
            .and_then(|el| el.value().attr("datetime"))
            .map(str::to_string);
        let href = article
            .select(&link_sel)
            .find_map(|el| el.value().attr("href"))
            .unwrap_or("");
        let id = extract_status_id(href).unwrap_or_else(|| format!("x-{}", items.len()));
        let url = if href.starts_with("http") {
            href.to_string()
        } else {
            format!("https://x.com{href}")
        };
        items.push(NewsItem {
            id,
            text,
            url,
            published_at,
        });
    }
    let _ = profile_url;
    items
}

/// Parse tweets embedded in X's client payload (`rest_id` + `full_text`).
fn parse_x_embedded(html: &str) -> Vec<NewsItem> {
    let mut seen = std::collections::HashSet::new();
    let mut items = Vec::new();
    for chunk in html.split("rest_id:\"").skip(1) {
        let Some((id, rest)) = chunk.split_once('"') else {
            continue;
        };
        if id.is_empty() || !id.chars().all(|ch| ch.is_ascii_digit()) {
            continue;
        }
        if seen.contains(id) {
            continue;
        }
        let Some((_, after_key)) = rest.split_once("full_text:\"") else {
            continue;
        };
        let Some(raw) = take_js_string_body(after_key) else {
            continue;
        };
        let text = unescape_js_string(raw);
        if text.trim().is_empty() {
            continue;
        }
        seen.insert(id.to_string());
        items.push(NewsItem {
            id: id.to_string(),
            text,
            url: format!("https://x.com/Interchouette/status/{id}"),
            published_at: None,
        });
    }
    items
}

fn parse_x_regex(html: &str, profile_url: &str) -> Vec<NewsItem> {
    let re = regex::Regex::new(STATUS_PATH_RE).expect("valid regex");
    let mut seen = std::collections::HashSet::new();
    let mut items = Vec::new();
    for cap in re.captures_iter(html) {
        let id = cap[1].to_string();
        if !seen.insert(id.clone()) {
            continue;
        }
        items.push(NewsItem {
            id: id.clone(),
            text: String::new(),
            url: format!("https://x.com/Interchouette/status/{id}"),
            published_at: None,
        });
    }
    let _ = profile_url;
    items
}

fn take_js_string_body(after_opening_quote: &str) -> Option<&str> {
    let mut end = 0;
    let bytes = after_opening_quote.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => {
                if i + 1 >= bytes.len() {
                    return None;
                }
                i += 2;
                end = i;
            }
            b'"' => return Some(&after_opening_quote[..end]),
            _ => {
                i += 1;
                end = i;
            }
        }
    }
    None
}

fn unescape_js_string(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars();
    while let Some(ch) = chars.next() {
        if ch != '\\' {
            out.push(ch);
            continue;
        }
        match chars.next() {
            Some('n') => out.push('\n'),
            Some('r') => out.push('\r'),
            Some('t') => out.push('\t'),
            Some('"') => out.push('"'),
            Some('\\') | None => out.push('\\'),
            Some('u') => {
                let hex: String = chars.by_ref().take(4).collect();
                if let Ok(code) = u32::from_str_radix(&hex, 16)
                    && let Some(decoded) = char::from_u32(code)
                {
                    out.push(decoded);
                    continue;
                }
                out.push('u');
                out.push_str(&hex);
            }
            Some(other) => out.push(other),
        }
    }
    out
}

fn extract_status_id(href: &str) -> Option<String> {
    let re = regex::Regex::new(STATUS_PATH_RE).ok()?;
    re.captures(href).map(|cap| cap[1].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_relay_timeline_skipping_pinned_and_quoted_posts() {
        let tweet = |id: &str, text: &str| {
            serde_json::json!({
                "content": { "content": { "tweet_results": { "result": {
                    "rest_id": id, "details": { "full_text": text },
                    "quoted_tweet_results": { "result": { "rest_id": "999", "details": { "full_text": "quoted" } } }
                } } } }
            })
        };
        let payload = serde_json::json!({
            "data": { "user_result_by_screen_name": { "result": {
                "profile_user_originals_timeline": { "timeline": { "instructions": [
                    { "__typename": "TimelinePinEntry", "entry": tweet("1", "Pinned") },
                    { "__typename": "TimelineAddEntries", "entries": [
                        tweet("1", "Pinned"), tweet("2", "Only new post")
                    ] }
                ] } }
            } } }
        });
        let html = format!(
            "<script>data={}</script>",
            serde_json::to_string(&payload.to_string()).unwrap()
        );
        let items = parse_x(&html, "https://x.com/interchouette", 8);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "2");
        assert_eq!(items[0].text, "Only new post");
    }

    #[test]
    fn skips_first_pinned_tweet() {
        let html = include_str!("fixtures/x_interchouette.html");
        let items = parse_x(html, "https://x.com/interchouette", 8);
        assert_eq!(items.len(), 2);
        assert!(!items[0].text.contains("Pinned hello"));
        assert!(items[0].text.contains("Dimforge"));
        assert!(items[1].text.contains("Herdr"));
    }

    #[test]
    fn parses_schema_org_timeline_html() {
        let html = include_str!("fixtures/x_interchouette_schema.html");
        let items = parse_x(html, "https://x.com/interchouette", 8);
        assert_eq!(items.len(), 2);
        assert!(items[0].text.contains("Dimforge"));
        assert_eq!(items[0].url, "https://x.com/Interchouette/status/9002");
        assert_eq!(
            items[0].published_at.as_deref(),
            Some("2026-08-17T10:00:00.000Z")
        );
    }

    #[test]
    fn parses_embedded_rest_id_full_text_payload() {
        let html = r#"
            rest_id:"9001",legacy:{full_text:"Pinned hello from ITCy."}
            rest_id:"9002",legacy:{full_text:"Dimforge shipped Nexus GPU physics in Rust.\nMore soon."}
            rest_id:"9003",legacy:{full_text:"Herdr terminal multiplexer for AI agents."}
        "#;
        let items = parse_x(html, "https://x.com/interchouette", 8);
        assert_eq!(items.len(), 2);
        let texts: Vec<&str> = items.iter().map(|item| item.text.as_str()).collect();
        assert!(texts.iter().any(|text| text.contains("Dimforge")));
        assert!(texts.iter().any(|text| text.contains("Herdr")));
        assert!(items[0].text.contains('\n') || items[1].text.contains('\n'));
        assert!(items.iter().any(|item| item.url.ends_with("/9002")));
    }

    #[test]
    fn unescape_js_string_handles_common_escapes() {
        assert_eq!(unescape_js_string(r#"a\nb\"c\\d"#), "a\nb\"c\\d");
    }

    #[test]
    fn take_js_string_body_stops_at_unescaped_quote() {
        assert_eq!(take_js_string_body(r#"hi",next"#), Some("hi"));
        assert_eq!(take_js_string_body(r#"a\"b","#), Some(r#"a\"b"#));
    }
}

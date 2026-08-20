//! Parse X (Twitter) profile timeline HTML into news items.

use html_escape::decode_html_entities;
use scraper::{Html, Selector};

use super::types::NewsItem;

const STATUS_PATH_RE: &str = r"/Interchouette/status/(\d+)";
const SCHEMA_POSTING: &str = "https://schema.org/SocialMediaPosting";

/// Extract timeline posts from an X profile page. Skips the first item (pinned).
#[must_use]
pub fn parse_x(html: &str, profile_url: &str, limit: usize) -> Vec<NewsItem> {
    let document = Html::parse_document(html);
    let mut items = parse_x_schema(&document);
    if items.is_empty() {
        items = parse_x_dom_legacy(&document, profile_url);
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
    items.truncate(limit);
    items
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
            .map(|value| value.trim().to_string())
            .unwrap_or_default();
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

fn extract_status_id(href: &str) -> Option<String> {
    let re = regex::Regex::new(STATUS_PATH_RE).ok()?;
    re.captures(href).map(|cap| cap[1].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

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
}

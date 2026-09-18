//! JSON types for the public news feed API.

use chrono::{DateTime, Datelike, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Twitter snowflake epoch (milliseconds).
const TWITTER_EPOCH_MS: u128 = 1_288_834_974_657;

/// One social post shown on `/news`.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, ToSchema)]
pub struct NewsItem {
    pub id: String,
    pub text: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
}

impl NewsItem {
    /// Recency key: `published_at` when present, else numeric `id` (LinkedIn/X snowflake).
    #[must_use]
    pub fn recency_rank(&self) -> (i64, u128) {
        let ts = self
            .published_at
            .as_deref()
            .and_then(parse_published_timestamp)
            .unwrap_or(0);
        let id = self.id.parse::<u128>().unwrap_or(0);
        (ts, id)
    }

    /// Fill `published_at` from a numeric snowflake id when the scrape omitted the date.
    pub fn ensure_published_at_from_id(&mut self, source: &str) {
        if self
            .published_at
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
        {
            return;
        }
        self.published_at = published_at_from_snowflake_id(source, &self.id);
    }
}

fn parse_published_timestamp(raw: &str) -> Option<i64> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(raw) {
        return Some(dt.timestamp());
    }
    raw.parse::<i64>()
        .ok()
        .map(|ms| if ms > 10_000_000_000 { ms / 1000 } else { ms })
}

/// RFC3339 time encoded in a numeric post id (`x` = Twitter snowflake, `linkedin` = unix-ms bits).
#[must_use]
pub fn published_at_from_snowflake_id(source: &str, item_id: &str) -> Option<String> {
    let id: u128 = item_id.parse().ok()?;
    // Real X/LinkedIn activity ids are ~18-19 digits; reject toy ids like "100".
    if id < 1_000_000_000_000_000 {
        return None;
    }
    let ms = match source {
        "x" => (id >> 22).saturating_add(TWITTER_EPOCH_MS),
        "linkedin" => id >> 22,
        _ => return None,
    };
    let ms = i64::try_from(ms).ok()?;
    let dt = DateTime::<Utc>::from_timestamp_millis(ms)?;
    let year = dt.year();
    if !(2015..=2100).contains(&year) {
        return None;
    }
    Some(dt.to_rfc3339())
}

/// Newest first by `published_at`, then by numeric id.
pub fn sort_news_items_newest_first(items: &mut [NewsItem]) {
    items.sort_by_key(|item| std::cmp::Reverse(item.recency_rank()));
}

/// Posts from one source (ITC `LinkedIn` or ITC X).
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, ToSchema)]
pub struct NewsFeed {
    pub items: Vec<NewsItem>,
    pub profile_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// All feeds returned by `GET /v1/news`.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, ToSchema)]
pub struct NewsFeeds {
    pub itc_linkedin: NewsFeed,
    pub itc_x: NewsFeed,
}

/// Top-level news API payload.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, ToSchema)]
pub struct NewsResponse {
    pub fetched_at: String,
    pub cache_ttl_secs: u64,
    pub feeds: NewsFeeds,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sorts_linkedin_activity_ids_newest_first_without_dates() {
        let mut items = vec![
            NewsItem {
                id: "100".into(),
                text: "old".into(),
                url: "u".into(),
                published_at: None,
            },
            NewsItem {
                id: "300".into(),
                text: "new".into(),
                url: "u".into(),
                published_at: None,
            },
            NewsItem {
                id: "200".into(),
                text: "mid".into(),
                url: "u".into(),
                published_at: None,
            },
        ];
        sort_news_items_newest_first(&mut items);
        assert_eq!(
            items.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(),
            vec!["300", "200", "100"]
        );
    }

    #[test]
    fn prefers_published_at_over_id() {
        let mut items = vec![
            NewsItem {
                id: "999".into(),
                text: "high id old date".into(),
                url: "u".into(),
                published_at: Some("2026-01-01T00:00:00Z".into()),
            },
            NewsItem {
                id: "1".into(),
                text: "low id new date".into(),
                url: "u".into(),
                published_at: Some("2026-09-01T00:00:00Z".into()),
            },
        ];
        sort_news_items_newest_first(&mut items);
        assert_eq!(items[0].id, "1");
    }

    #[test]
    fn twitter_snowflake_maps_to_post_week_not_scrape_time() {
        // 2094367997041291324 = 2026-08-31 (ISO W36)
        let at = published_at_from_snowflake_id("x", "2094367997041291324").expect("ts");
        assert!(at.starts_with("2026-08-31"), "{at}");
    }

    #[test]
    fn linkedin_activity_id_maps_to_unix_ms_week() {
        // 7506470935969849345 ≈ 2026-09-17
        let at = published_at_from_snowflake_id("linkedin", "7506470935969849345").expect("ts");
        assert!(at.starts_with("2026-09-17"), "{at}");
    }

    #[test]
    fn rejects_undersized_numeric_ids_as_snowflakes() {
        assert!(published_at_from_snowflake_id("x", "100").is_none());
        assert!(published_at_from_snowflake_id("linkedin", "300").is_none());
    }
}

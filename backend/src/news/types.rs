//! JSON types for the public news feed API.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// One social post shown on `/news`.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, ToSchema)]
pub struct NewsItem {
    pub id: String,
    pub text: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
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

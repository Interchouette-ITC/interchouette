//! Public news feeds (`LinkedIn` + X) for interchouette.net/news.

pub(crate) mod api;
mod cache;
mod feed;
mod fetch;
mod parse_linkedin;
mod parse_x;
pub(crate) mod types;

pub use api::{news_handler, NewsState};
pub use types::{NewsFeed, NewsFeeds, NewsItem, NewsResponse};

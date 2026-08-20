//! Public news feeds (`LinkedIn` + X) for interchouette.net/news.

mod api;
mod cache;
mod fetch;
mod parse_linkedin;
mod parse_x;
mod types;

pub use api::NewsState;
pub use types::{NewsFeed, NewsFeeds, NewsItem, NewsResponse};

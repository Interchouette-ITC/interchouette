//! In-memory TTL cache for parsed news feeds.

use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::RwLock;

use super::types::NewsResponse;

#[derive(Clone, Debug)]
struct CacheEntry {
    response: NewsResponse,
    stored_at: Instant,
}

/// Thread-safe cache for locale-independent news feeds.
#[derive(Clone, Default)]
pub struct NewsCache {
    inner: Arc<RwLock<Option<CacheEntry>>>,
}

impl NewsCache {
    /// Return a fresh cached response when TTL has not expired.
    pub async fn get_fresh(&self, ttl: Duration) -> Option<NewsResponse> {
        let entry = {
            let guard = self.inner.read().await;
            guard.clone()
        }?;
        if entry.stored_at.elapsed() <= ttl {
            return Some(entry.response);
        }
        None
    }

    /// Return any cached response regardless of age.
    pub async fn get_stale(&self) -> Option<NewsResponse> {
        let guard = self.inner.read().await;
        guard.as_ref().map(|entry| entry.response.clone())
    }

    /// Store a response.
    pub async fn put(&self, response: NewsResponse) {
        let mut guard = self.inner.write().await;
        *guard = Some(CacheEntry {
            response,
            stored_at: Instant::now(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::news::types::{NewsFeed, NewsFeeds, NewsResponse};

    fn empty_response() -> NewsResponse {
        let empty = NewsFeed {
            items: vec![],
            profile_url: "https://example.com".into(),
            error: None,
        };
        NewsResponse {
            fetched_at: "2026-01-01T00:00:00Z".into(),
            cache_ttl_secs: 14400,
            feeds: NewsFeeds {
                itc_linkedin: empty.clone(),
                itc_x: empty,
            },
        }
    }

    #[tokio::test]
    async fn fresh_entry_is_returned_within_ttl() {
        let cache = NewsCache::default();
        cache.put(empty_response()).await;
        assert!(cache.get_fresh(Duration::from_mins(1)).await.is_some());
    }

    #[tokio::test]
    async fn daily_ttl_expires_after_24_hours() {
        let cache = NewsCache {
            inner: Arc::new(RwLock::new(None)),
        };
        {
            let mut guard = cache.inner.write().await;
            *guard = Some(CacheEntry {
                response: empty_response(),
                stored_at: Instant::now()
                    .checked_sub(Duration::from_hours(23))
                    .unwrap_or_else(Instant::now),
            });
        }
        assert!(cache.get_fresh(Duration::from_hours(24)).await.is_some());
        {
            let mut guard = cache.inner.write().await;
            guard.as_mut().unwrap().stored_at = Instant::now()
                .checked_sub(Duration::from_hours(25))
                .unwrap_or_else(Instant::now);
        }
        assert!(cache.get_fresh(Duration::from_hours(24)).await.is_none());
        assert!(cache.get_stale().await.is_some());
    }
}

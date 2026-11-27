//! News HTTP routes and refresh orchestration.

use std::{sync::Arc, time::Duration};

use axum::extract::{Path, Query, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use chrono::Utc;
use serde::Deserialize;
use tokio::sync::Mutex;
use tracing::warn;

use super::archive::{NewsArchive, NewsArchiveIndex};
use super::cache::NewsCache;
use super::feed::{build_atom, build_rss};
use super::fetch::NewsFetcher;
use super::types::{NewsFeed, NewsFeeds, NewsResponse};

const DEFAULT_CACHE_TTL_SECS: u64 = 86_400;

/// Shared news runtime state.
#[derive(Clone)]
pub struct NewsState {
    cache: NewsCache,
    refresh_lock: Arc<Mutex<()>>,
    fetcher: NewsFetcher,
    archive: NewsArchive,
    cache_ttl_secs: u64,
}

impl NewsState {
    /// Build from environment (`NEWS_CACHE_TTL_SECS`, optional `NEWS_DB`).
    pub async fn from_env() -> Self {
        let cache_ttl_secs = std::env::var("NEWS_CACHE_TTL_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(DEFAULT_CACHE_TTL_SECS);
        Self {
            cache: NewsCache::default(),
            refresh_lock: Arc::new(Mutex::new(())),
            fetcher: NewsFetcher::from_env(),
            archive: NewsArchive::from_env().await,
            cache_ttl_secs,
        }
    }

    /// Test helper: live fetcher/cache only, archive disabled (`pool = None`).
    #[cfg(test)]
    fn without_archive() -> Self {
        Self {
            cache: NewsCache::default(),
            refresh_lock: Arc::new(Mutex::new(())),
            fetcher: NewsFetcher::from_env(),
            archive: NewsArchive::default(),
            cache_ttl_secs: DEFAULT_CACHE_TTL_SECS,
        }
    }

    /// Mount news routes on the router.
    pub fn router(self) -> Router {
        Router::new()
            .route("/v1/news", get(news_handler))
            .route("/v1/news/rss.xml", get(news_rss_handler))
            .route("/v1/news/atom.xml", get(news_atom_handler))
            .route("/v1/news/archive", get(news_archive_list_handler))
            .route("/v1/news/archive/{week_id}", get(news_archive_week_handler))
            .with_state(self)
    }

    /// Prefetch the shared feed when the process starts.
    pub fn spawn_cache_warmup(self) {
        tokio::spawn(async move {
            self.load("en").await;
            tracing::info!("news cache warmup finished");
        });
    }

    async fn load(&self, locale: &str) -> NewsResponse {
        let ttl = Duration::from_secs(self.cache_ttl_secs);
        if let Some(cached) = self.cache.get_fresh(ttl).await {
            return cached;
        }
        let _refresh_guard = self.refresh_lock.lock().await;
        if let Some(cached) = self.cache.get_fresh(ttl).await {
            return cached;
        }
        match self.refresh(locale).await {
            Ok(response) => response,
            Err(err) => {
                if let Some(stale) = self.cache.get_stale().await {
                    warn!(error = %err, locale, "news refresh failed; serving stale cache");
                    return stale;
                }
                warn!(error = %err, locale, "news refresh failed; returning empty feeds");
                empty_response(locale, self.cache_ttl_secs, Some(err))
            }
        }
    }

    async fn refresh(&self, locale: &str) -> Result<NewsResponse, String> {
        tracing::info!(cache_ttl_secs = self.cache_ttl_secs, "news refresh started");
        let (itc_linkedin, itc_x) = tokio::join!(
            self.fetcher.fetch_itc_linkedin(),
            self.fetcher.fetch_itc_x()
        );
        let mut response = NewsResponse {
            fetched_at: Utc::now().to_rfc3339(),
            cache_ttl_secs: self.cache_ttl_secs,
            feeds: NewsFeeds {
                itc_linkedin,
                itc_x,
            },
        };
        self.archive.upsert_week(locale, &response).await;
        let cached = self.cache.get_stale().await;
        self.restore_failed_feed(
            "linkedin",
            &mut response.feeds.itc_linkedin,
            cached.as_ref().map(|value| &value.feeds.itc_linkedin),
        )
        .await;
        self.restore_failed_feed(
            "x",
            &mut response.feeds.itc_x,
            cached.as_ref().map(|value| &value.feeds.itc_x),
        )
        .await;
        self.cache.put(response.clone()).await;
        Ok(response)
    }

    async fn restore_failed_feed(
        &self,
        source: &str,
        feed: &mut NewsFeed,
        cached: Option<&NewsFeed>,
    ) {
        let Some(error) = &feed.error else {
            return;
        };
        warn!(source, error, "news source refresh failed");
        if !feed.items.is_empty() {
            return;
        }
        if let Some(previous) = cached.filter(|value| !value.items.is_empty()) {
            feed.items.clone_from(&previous.items);
            tracing::info!(
                source,
                posts = feed.items.len(),
                "serving cached news after refresh failure"
            );
        } else {
            feed.items = self
                .archive
                .latest_items(source, self.fetcher.fetch_limit())
                .await;
            tracing::info!(
                source,
                posts = feed.items.len(),
                "serving archived news after refresh failure"
            );
        }
    }
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
pub struct NewsQuery {
    /// Site locale: `en`, `nl`, or `fr` (default `en`).
    pub locale: Option<String>,
}

/// Cached ITC `LinkedIn` and X posts for the public news page.
#[utoipa::path(
    get,
    path = "/v1/news",
    tag = "public",
    params(NewsQuery),
    responses(
        (status = 200, description = "News feeds payload", body = NewsResponse)
    )
)]
pub async fn news_handler(
    State(state): State<NewsState>,
    Query(q): Query<NewsQuery>,
) -> Json<NewsResponse> {
    let locale = normalize_locale(q.locale.as_deref());
    Json(state.load(&locale).await)
}

/// RSS 2.0 from the same news cache as `GET /v1/news`.
#[utoipa::path(
    get,
    path = "/v1/news/rss.xml",
    tag = "public",
    params(NewsQuery),
    responses((status = 200, description = "RSS 2.0 news feed"))
)]
pub async fn news_rss_handler(
    State(state): State<NewsState>,
    Query(q): Query<NewsQuery>,
) -> impl IntoResponse {
    let locale = normalize_locale(q.locale.as_deref());
    let body = build_rss(&state.load(&locale).await);
    xml_response("application/rss+xml; charset=utf-8", body)
}

/// Atom 1.0 from the same news cache as `GET /v1/news`.
#[utoipa::path(
    get,
    path = "/v1/news/atom.xml",
    tag = "public",
    params(NewsQuery),
    responses((status = 200, description = "Atom 1.0 news feed"))
)]
pub async fn news_atom_handler(
    State(state): State<NewsState>,
    Query(q): Query<NewsQuery>,
) -> impl IntoResponse {
    let locale = normalize_locale(q.locale.as_deref());
    let body = build_atom(&state.load(&locale).await);
    xml_response("application/atom+xml; charset=utf-8", body)
}

/// ISO-week news archive index (newest first). Empty when Postgres is unset.
#[utoipa::path(
    get,
    path = "/v1/news/archive",
    tag = "public",
    params(NewsQuery),
    responses(
        (status = 200, description = "News archive week index", body = NewsArchiveIndex)
    )
)]
pub async fn news_archive_list_handler(
    State(state): State<NewsState>,
    Query(q): Query<NewsQuery>,
) -> Json<NewsArchiveIndex> {
    let locale = normalize_locale(q.locale.as_deref());
    Json(state.archive.list_weeks(&locale).await)
}

/// One archived ISO-week snapshot (`YYYY-Www`).
#[utoipa::path(
    get,
    path = "/v1/news/archive/{week_id}",
    tag = "public",
    params(
        ("week_id" = String, Path, description = "ISO week id, e.g. 2026-W34"),
        NewsQuery
    ),
    responses(
        (status = 200, description = "Archived news feeds payload", body = NewsResponse),
        (status = 404, description = "Week not found")
    )
)]
pub async fn news_archive_week_handler(
    State(state): State<NewsState>,
    Path(week_id): Path<String>,
    Query(q): Query<NewsQuery>,
) -> impl IntoResponse {
    let locale = normalize_locale(q.locale.as_deref());
    state.archive.get_week(&locale, &week_id).await.map_or_else(
        || StatusCode::NOT_FOUND.into_response(),
        |body| (StatusCode::OK, Json(body)).into_response(),
    )
}

fn xml_response(content_type: &'static str, body: String) -> impl IntoResponse {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, HeaderValue::from_static(content_type))],
        body,
    )
}

fn normalize_locale(raw: Option<&str>) -> String {
    match raw.unwrap_or("en").trim().to_ascii_lowercase().as_str() {
        "nl" => "nl".into(),
        "fr" => "fr".into(),
        _ => "en".into(),
    }
}

fn empty_response(_locale: &str, cache_ttl_secs: u64, error: Option<String>) -> NewsResponse {
    let msg = error.unwrap_or_else(|| "news unavailable".into());
    let itc_linkedin_profile =
        "https://www.linkedin.com/company/interchouette-itc/posts/?feedView=all".into();
    let itc_x_profile = "https://x.com/interchouette".into();
    let empty_feed = |profile_url: String| super::types::NewsFeed {
        items: vec![],
        profile_url,
        error: Some(msg.clone()),
    };
    NewsResponse {
        fetched_at: Utc::now().to_rfc3339(),
        cache_ttl_secs,
        feeds: NewsFeeds {
            itc_linkedin: empty_feed(itc_linkedin_profile),
            itc_x: empty_feed(itc_x_profile),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    #[tokio::test]
    async fn failed_source_restores_cached_or_archived_posts_without_hiding_error() {
        let path = std::env::temp_dir().join(format!(
            "news-fallback-{}-{}.db",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap()
        ));
        let mut state = NewsState::without_archive();
        state.archive = NewsArchive::from_path(&path).await;
        let post = super::super::types::NewsItem {
            id: "123".into(),
            text: "Archived post".into(),
            url: "https://example.com/post".into(),
            published_at: Some(Utc::now().to_rfc3339()),
        };
        let archived = NewsFeed {
            items: vec![post.clone()],
            profile_url: "https://example.com".into(),
            error: None,
        };
        let mut response = empty_response("en", 14400, None);
        response.feeds.itc_linkedin = archived.clone();
        state.archive.upsert_week("en", &response).await;

        let mut failed = NewsFeed {
            items: vec![],
            profile_url: archived.profile_url.clone(),
            error: Some("HTTP 403".into()),
        };
        state
            .restore_failed_feed("linkedin", &mut failed, None)
            .await;
        assert_eq!(failed.items, vec![post.clone()]);
        assert_eq!(failed.error.as_deref(), Some("HTTP 403"));

        let mut other = NewsFeed {
            items: vec![],
            profile_url: archived.profile_url.clone(),
            error: Some("unavailable".into()),
        };
        state.restore_failed_feed("x", &mut other, None).await;
        assert_eq!(other.items, []);
        state
            .restore_failed_feed("x", &mut other, Some(&archived))
            .await;
        assert_eq!(other.items, vec![post.clone()]);
        assert_eq!(other.error.as_deref(), Some("unavailable"));

        let mut successful = NewsFeed {
            items: vec![],
            profile_url: archived.profile_url.clone(),
            error: None,
        };
        state
            .restore_failed_feed("linkedin", &mut successful, Some(&archived))
            .await;
        assert_eq!(successful.items, []);
        drop(state);
        tokio::fs::remove_file(path).await.expect("remove archive");
    }

    #[test]
    fn normalize_locale_accepts_known_values() {
        assert_eq!(normalize_locale(Some("nl")), "nl");
        assert_eq!(normalize_locale(Some("FR")), "fr");
        assert_eq!(normalize_locale(None), "en");
    }

    #[tokio::test]
    async fn concurrent_locales_share_an_in_progress_refresh() {
        let state = NewsState::without_archive();
        let guard = state.refresh_lock.lock().await;
        let en = {
            let state = state.clone();
            tokio::spawn(async move { state.load("en").await })
        };
        let fr = {
            let state = state.clone();
            tokio::spawn(async move { state.load("fr").await })
        };
        tokio::task::yield_now().await;
        let response = empty_response("en", DEFAULT_CACHE_TTL_SECS, None);
        state.cache.put(response.clone()).await;
        drop(guard);
        let (en, fr) = tokio::time::timeout(Duration::from_secs(2), async { tokio::join!(en, fr) })
            .await
            .expect("waiting requests should reuse the shared cache");
        assert_eq!(en.unwrap(), response);
        assert_eq!(fr.unwrap(), response);
    }

    #[tokio::test]
    async fn news_endpoint_returns_json_shape() {
        let state = NewsState::without_archive();
        state
            .cache
            .put(empty_response("en", DEFAULT_CACHE_TTL_SECS, None))
            .await;
        let app = state.router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/v1/news?locale=en")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn news_rss_endpoint_returns_xml() {
        let state = NewsState::without_archive();
        state
            .cache
            .put(empty_response("en", DEFAULT_CACHE_TTL_SECS, None))
            .await;
        let app = state.router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/v1/news/rss.xml")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let ctype = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        assert!(ctype.contains("rss+xml"));
    }

    #[tokio::test]
    async fn archive_list_returns_empty_without_database() {
        let app = NewsState::without_archive().router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/v1/news/archive?locale=en")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let index: NewsArchiveIndex = serde_json::from_slice(&body).unwrap();
        assert_eq!(index.weeks.len(), 0);
    }

    #[tokio::test]
    async fn archive_week_returns_404_without_database() {
        let app = NewsState::without_archive().router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/v1/news/archive/2026-W34?locale=en")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}

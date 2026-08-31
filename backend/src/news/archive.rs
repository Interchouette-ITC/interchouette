//! Durable news archive in `SQLite` (`NEWS_DB`).
//!
//! Items merge by `(source, item_id)` and bucket into ISO weeks from `published_at`.
//! Live `/v1/news` stays an in-memory top-N snapshot; archive GETs rebuild from rows.

use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::{DateTime, Duration as ChronoDuration, Utc};
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use tracing::warn;
use utoipa::ToSchema;

use super::github_sync::GitHubNewsSync;
use super::types::{NewsFeed, NewsFeeds, NewsItem, NewsResponse};

const RETENTION_WEEKS: i64 = 52;
const DEFAULT_NEWS_DB_DEPLOY: &str = "/app/db/news.db";
const DEFAULT_NEWS_DB_LOCAL: &str = "db/news.db";
const PROFILE_LINKEDIN: &str =
    "https://www.linkedin.com/company/interchouette-itc/posts/?feedView=all";
const PROFILE_X: &str = "https://x.com/interchouette";

/// One week row in the archive index.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, ToSchema)]
pub struct NewsArchiveWeek {
    pub week_id: String,
    pub fetched_at: String,
}

/// `GET /v1/news/archive` body.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, ToSchema)]
pub struct NewsArchiveIndex {
    pub locale: String,
    pub weeks: Vec<NewsArchiveWeek>,
}

/// Optional SQLite-backed archive (no-op when path unset / open fails).
#[derive(Clone, Default)]
pub struct NewsArchive {
    pool: Option<SqlitePool>,
    path: Option<PathBuf>,
    sync: Option<GitHubNewsSync>,
}

impl NewsArchive {
    /// Open `SQLite` (`NEWS_DB` or `/app/db/news.db` / `db/news.db`); GitHub pull when `NEWS_GITHUB_TOKEN` is set.
    pub async fn from_env() -> Self {
        let path = resolve_news_db_path();
        let sync = GitHubNewsSync::from_env();
        if let Some(ref sync) = sync {
            if let Err(err) = sync.pull_to(&path).await {
                warn!(error = %err, "news archive GitHub pull failed; opening local file");
            }
        }
        let mut archive = Self::from_path(&path).await;
        archive.path = Some(path);
        archive.sync = sync;
        archive
    }

    /// Open (and migrate) the archive database at `path`.
    pub async fn from_path(path: &Path) -> Self {
        if let Some(parent) = path.parent() {
            if let Err(err) = tokio::fs::create_dir_all(parent).await {
                warn!(error = %err, path = %path.display(), "news archive mkdir failed");
                return Self::default();
            }
        }
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true);
        match SqlitePoolOptions::new()
            .max_connections(2)
            .acquire_timeout(Duration::from_secs(8))
            .connect_with(options)
            .await
        {
            Ok(pool) => match migrate(&pool).await {
                Ok(()) => {
                    tracing::info!(path = %path.display(), "news archive SQLite ready");
                    Self {
                        pool: Some(pool),
                        path: Some(path.to_path_buf()),
                        sync: None,
                    }
                }
                Err(err) => {
                    warn!(error = %err, "news archive migrate failed; archive disabled");
                    Self::default()
                }
            },
            Err(err) => {
                warn!(error = %err, path = %path.display(), "news archive open failed; archive disabled");
                Self::default()
            }
        }
    }

    /// Merge scraped feeds into the archive (does not replace other weeks/items).
    pub async fn upsert_week(&self, _locale: &str, response: &NewsResponse) {
        let Some(pool) = &self.pool else {
            return;
        };
        let now = Utc::now().to_rfc3339();
        let mut dirty = false;
        dirty |= merge_feed(pool, "linkedin", &response.feeds.itc_linkedin.items, &now).await;
        dirty |= merge_feed(pool, "x", &response.feeds.itc_x.items, &now).await;
        dirty |= prune_old_weeks(pool).await;
        if dirty {
            self.push_if_configured(pool).await;
        }
    }

    async fn push_if_configured(&self, pool: &SqlitePool) {
        let (Some(sync), Some(path)) = (&self.sync, &self.path) else {
            return;
        };
        if let Err(err) = sync.push_from(path, pool).await {
            warn!(error = %err, "news archive GitHub push failed");
        }
    }

    /// Week index newest-first (empty when archive is disabled).
    pub async fn list_weeks(&self, locale: &str) -> NewsArchiveIndex {
        let Some(pool) = &self.pool else {
            return NewsArchiveIndex {
                locale: locale.to_owned(),
                weeks: vec![],
            };
        };
        match sqlx::query(
            r"
            SELECT week_id,
                   COALESCE(MAX(last_seen_at), MAX(published_at), '') AS fetched_at
            FROM news_items
            GROUP BY week_id
            ORDER BY week_id DESC
            ",
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => {
                let weeks = rows
                    .into_iter()
                    .map(|row| NewsArchiveWeek {
                        week_id: row.get("week_id"),
                        fetched_at: row.get("fetched_at"),
                    })
                    .collect();
                NewsArchiveIndex {
                    locale: locale.to_owned(),
                    weeks,
                }
            }
            Err(err) => {
                warn!(error = %err, locale, "news archive list failed");
                NewsArchiveIndex {
                    locale: locale.to_owned(),
                    weeks: vec![],
                }
            }
        }
    }

    /// Rebuild one week as a `NewsResponse`, or `None` when missing / disabled.
    pub async fn get_week(&self, locale: &str, week_id: &str) -> Option<NewsResponse> {
        let pool = self.pool.as_ref()?;
        if !is_valid_week_id(week_id) {
            return None;
        }
        let rows = sqlx::query(
            r"
            SELECT source, item_id, url, text, published_at, last_seen_at
            FROM news_items
            WHERE week_id = ?
            ORDER BY COALESCE(published_at, last_seen_at) DESC
            ",
        )
        .bind(week_id)
        .fetch_all(pool)
        .await
        .map_err(|err| {
            warn!(error = %err, locale, week_id, "news archive get failed");
            err
        })
        .ok()?;
        if rows.is_empty() {
            return None;
        }
        let mut linkedin = Vec::new();
        let mut x = Vec::new();
        let mut latest_seen = String::new();
        for row in rows {
            let source: String = row.get("source");
            let published_at: Option<String> = row.get("published_at");
            let last_seen: String = row.get("last_seen_at");
            if last_seen > latest_seen {
                latest_seen = last_seen;
            }
            let text: String = row.get("text");
            let item = NewsItem {
                id: row.get("item_id"),
                text: sanitize_public_text(&text),
                url: row.get("url"),
                published_at,
            };
            match source.as_str() {
                "linkedin" => linkedin.push(item),
                "x" => x.push(item),
                _ => {}
            }
        }
        Some(NewsResponse {
            fetched_at: if latest_seen.is_empty() {
                Utc::now().to_rfc3339()
            } else {
                latest_seen
            },
            cache_ttl_secs: 0,
            feeds: NewsFeeds {
                itc_linkedin: NewsFeed {
                    items: linkedin,
                    profile_url: PROFILE_LINKEDIN.to_owned(),
                    error: None,
                },
                itc_x: NewsFeed {
                    items: x,
                    profile_url: PROFILE_X.to_owned(),
                    error: None,
                },
            },
        })
    }
}

fn resolve_news_db_path() -> PathBuf {
    if let Ok(path) = std::env::var("NEWS_DB") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if Path::new("/app/db").is_dir() {
        PathBuf::from(DEFAULT_NEWS_DB_DEPLOY)
    } else {
        PathBuf::from(DEFAULT_NEWS_DB_LOCAL)
    }
}

async fn merge_feed(pool: &SqlitePool, source: &str, items: &[NewsItem], now: &str) -> bool {
    let mut dirty = false;
    for item in items {
        let item_id = item.id.trim();
        let url = item.url.trim();
        if item_id.is_empty() || url.is_empty() {
            continue;
        }
        let week_id = item
            .published_at
            .as_deref()
            .and_then(week_id_from_fetched_at)
            .unwrap_or_else(|| week_id_from_fetched_at(now).unwrap_or_else(|| "1970-W01".into()));
        let hash = content_hash(source, item_id, url);
        match sqlx::query(
            r"
            INSERT INTO news_items (
              week_id, source, item_id, content_hash, published_at, url, text,
              first_seen_at, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source, item_id) DO UPDATE SET
              week_id = excluded.week_id,
              content_hash = excluded.content_hash,
              published_at = COALESCE(excluded.published_at, news_items.published_at),
              url = excluded.url,
              text = excluded.text,
              last_seen_at = excluded.last_seen_at
            WHERE news_items.content_hash != excluded.content_hash
               OR news_items.url != excluded.url
               OR news_items.text != excluded.text
               OR news_items.week_id != excluded.week_id
               OR IFNULL(news_items.published_at, '') != IFNULL(excluded.published_at, '')
            ",
        )
        .bind(&week_id)
        .bind(source)
        .bind(item_id)
        .bind(&hash)
        .bind(item.published_at.as_deref())
        .bind(url)
        .bind(sanitize_public_text(&item.text))
        .bind(now)
        .bind(now)
        .execute(pool)
        .await
        {
            Ok(result) => {
                if result.rows_affected() > 0 {
                    dirty = true;
                }
            }
            Err(err) => {
                warn!(error = %err, source, item_id, "news archive merge failed");
            }
        }
    }
    dirty
}

async fn migrate(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r"
        CREATE TABLE IF NOT EXISTS news_items (
            week_id TEXT NOT NULL,
            source TEXT NOT NULL,
            item_id TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            published_at TEXT,
            url TEXT NOT NULL,
            text TEXT NOT NULL,
            first_seen_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            PRIMARY KEY (week_id, source, item_id)
        )
        ",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_news_source_item ON news_items(source, item_id)",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        r"
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        )
        ",
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn prune_old_weeks(pool: &SqlitePool) -> bool {
    let cutoff = Utc::now() - ChronoDuration::weeks(RETENTION_WEEKS);
    let cutoff_id = cutoff.format("%G-W%V").to_string();
    match sqlx::query("DELETE FROM news_items WHERE week_id < ?")
        .bind(&cutoff_id)
        .execute(pool)
        .await
    {
        Ok(result) => result.rows_affected() > 0,
        Err(err) => {
            warn!(error = %err, cutoff_id, "news archive prune failed");
            false
        }
    }
}

/// Drop publication-bot metadata that must never appear on the public site.
fn sanitize_public_text(text: &str) -> String {
    let trimmed = text.trim_end();
    for marker in ["\n\nSources:", "\n\nCite = option", "\n\nSwap: /change_tweet_url"] {
        if let Some(idx) = trimmed.find(marker) {
            return trimmed[..idx].trim_end().to_string();
        }
    }
    trimmed.to_string()
}

fn content_hash(source: &str, item_id: &str, url: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(source.as_bytes());
    hasher.update([0]);
    hasher.update(item_id.as_bytes());
    hasher.update([0]);
    hasher.update(url.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// ISO week id `YYYY-Www` from an RFC3339 timestamp (UTC).
#[must_use]
pub fn week_id_from_fetched_at(fetched_at: &str) -> Option<String> {
    let dt = DateTime::parse_from_rfc3339(fetched_at)
        .ok()?
        .with_timezone(&Utc);
    Some(dt.format("%G-W%V").to_string())
}

#[must_use]
pub const fn is_valid_week_id(week_id: &str) -> bool {
    let bytes = week_id.as_bytes();
    if bytes.len() != 8 {
        return false;
    }
    bytes[0].is_ascii_digit()
        && bytes[1].is_ascii_digit()
        && bytes[2].is_ascii_digit()
        && bytes[3].is_ascii_digit()
        && bytes[4] == b'-'
        && bytes[5] == b'W'
        && bytes[6].is_ascii_digit()
        && bytes[7].is_ascii_digit()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn week_id_uses_iso_week() {
        assert_eq!(
            week_id_from_fetched_at("2026-08-21T12:00:00Z").as_deref(),
            Some("2026-W34")
        );
    }

    #[test]
    fn week_id_rejects_garbage() {
        assert!(week_id_from_fetched_at("not-a-date").is_none());
    }

    #[test]
    fn validates_week_id_shape() {
        assert!(is_valid_week_id("2026-W34"));
        assert!(!is_valid_week_id("2026-W3"));
        assert!(!is_valid_week_id("2026-w34"));
        assert!(!is_valid_week_id("../etc"));
    }

    #[test]
    fn sanitize_strips_publication_bot_metadata() {
        let raw = "🦉 Proton's move to Rust.\n\nhttps://cyberinsider.com/foo/\n\nSources: \n- cyberinsider.com\n\nCite = option 1 (URL in tweet). Swap: /change_tweet_url TWEET-20260814-000014 <0|1|2|3|url>";
        assert_eq!(
            sanitize_public_text(raw),
            "🦉 Proton's move to Rust.\n\nhttps://cyberinsider.com/foo/"
        );
        let cite_only = "Hello!\n\nCite = option 1 (publisher URL in body). Swap: /change_tweet_url TWEET-1 <0|1|2|3|url>";
        assert_eq!(sanitize_public_text(cite_only), "Hello!");
    }

    #[test]
    fn content_hash_is_stable() {
        assert_eq!(
            content_hash("x", "1", "https://example.com/1"),
            content_hash("x", "1", "https://example.com/1")
        );
        assert_ne!(
            content_hash("x", "1", "https://example.com/1"),
            content_hash("x", "2", "https://example.com/1")
        );
    }

    #[tokio::test]
    async fn disabled_archive_returns_empty_list() {
        let archive = NewsArchive::default();
        let index = archive.list_weeks("en").await;
        assert_eq!(index.weeks.len(), 0);
        assert!(archive.get_week("en", "2026-W34").await.is_none());
    }

    #[tokio::test]
    async fn merge_keeps_older_ids_when_scrape_omits_them() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("news-archive-{nanos}.db"));
        let archive = NewsArchive::from_path(&path).await;
        assert!(archive.pool.is_some());

        let first = NewsResponse {
            fetched_at: "2026-08-25T12:00:00Z".into(),
            cache_ttl_secs: 14400,
            feeds: NewsFeeds {
                itc_linkedin: NewsFeed {
                    items: vec![NewsItem {
                        id: "111".into(),
                        text: "old".into(),
                        url: "https://www.linkedin.com/feed/update/urn:li:activity:111".into(),
                        published_at: Some("2026-08-25T10:00:00Z".into()),
                    }],
                    profile_url: PROFILE_LINKEDIN.into(),
                    error: None,
                },
                itc_x: NewsFeed {
                    items: vec![],
                    profile_url: PROFILE_X.into(),
                    error: None,
                },
            },
        };
        archive.upsert_week("en", &first).await;

        let second = NewsResponse {
            fetched_at: "2026-08-25T16:00:00Z".into(),
            cache_ttl_secs: 14400,
            feeds: NewsFeeds {
                itc_linkedin: NewsFeed {
                    items: vec![NewsItem {
                        id: "222".into(),
                        text: "new".into(),
                        url: "https://www.linkedin.com/feed/update/urn:li:activity:222".into(),
                        published_at: Some("2026-08-25T15:00:00Z".into()),
                    }],
                    profile_url: PROFILE_LINKEDIN.into(),
                    error: None,
                },
                itc_x: NewsFeed {
                    items: vec![],
                    profile_url: PROFILE_X.into(),
                    error: None,
                },
            },
        };
        archive.upsert_week("en", &second).await;

        let week = archive.get_week("en", "2026-W35").await.expect("week");
        let ids: Vec<_> = week
            .feeds
            .itc_linkedin
            .items
            .iter()
            .map(|i| i.id.as_str())
            .collect();
        assert!(ids.contains(&"111"));
        assert!(ids.contains(&"222"));
        let _ = tokio::fs::remove_file(&path).await;
    }
}

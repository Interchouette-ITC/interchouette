//! Durable ISO-week news snapshots in Postgres (`DATABASE_URL`).

use std::time::Duration;

use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};
use tracing::warn;
use utoipa::ToSchema;

use super::types::NewsResponse;

const RETENTION_WEEKS: i64 = 52;

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

/// Optional Postgres-backed archive (no-op when `DATABASE_URL` is unset).
#[derive(Clone, Default)]
pub struct NewsArchive {
    pool: Option<PgPool>,
}

impl NewsArchive {
    /// Connect and migrate when `DATABASE_URL` is set; otherwise stay disabled.
    pub async fn from_env() -> Self {
        let Ok(url) = std::env::var("DATABASE_URL") else {
            return Self { pool: None };
        };
        if url.trim().is_empty() {
            return Self { pool: None };
        }
        match PgPoolOptions::new()
            .max_connections(2)
            .acquire_timeout(Duration::from_secs(8))
            .connect(&url)
            .await
        {
            Ok(pool) => match migrate(&pool).await {
                Ok(()) => {
                    tracing::info!("news archive Postgres ready");
                    Self { pool: Some(pool) }
                }
                Err(err) => {
                    warn!(error = %err, "news archive migrate failed; archive disabled");
                    Self { pool: None }
                }
            },
            Err(err) => {
                warn!(error = %err, "news archive connect failed; archive disabled");
                Self { pool: None }
            }
        }
    }

    /// Persist a successful refresh for the ISO week of `fetched_at` (overwrites same week).
    pub async fn upsert_week(&self, locale: &str, response: &NewsResponse) {
        let Some(pool) = &self.pool else {
            return;
        };
        let Some(week_id) = week_id_from_fetched_at(&response.fetched_at) else {
            warn!(fetched_at = %response.fetched_at, "news archive skip upsert: bad fetched_at");
            return;
        };
        let Ok(fetched_at) = DateTime::parse_from_rfc3339(&response.fetched_at) else {
            return;
        };
        let fetched_at = fetched_at.with_timezone(&Utc);
        let Ok(payload) = serde_json::to_value(response) else {
            warn!("news archive skip upsert: payload serialize failed");
            return;
        };
        if let Err(err) = sqlx::query(
            r"
            INSERT INTO news_weeks (week_id, locale, fetched_at, payload)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (week_id, locale)
            DO UPDATE SET fetched_at = EXCLUDED.fetched_at, payload = EXCLUDED.payload
            ",
        )
        .bind(&week_id)
        .bind(locale)
        .bind(fetched_at)
        .bind(payload)
        .execute(pool)
        .await
        {
            warn!(error = %err, locale, week_id, "news archive upsert failed");
            return;
        }
        prune_old_weeks(pool, locale).await;
    }

    /// Latest week payload when its `fetched_at` is still within `ttl`.
    pub async fn load_latest_if_fresh(&self, locale: &str, ttl: Duration) -> Option<NewsResponse> {
        let pool = self.pool.as_ref()?;
        let row = sqlx::query(
            r"
            SELECT fetched_at, payload
            FROM news_weeks
            WHERE locale = $1
            ORDER BY week_id DESC
            LIMIT 1
            ",
        )
        .bind(locale)
        .fetch_optional(pool)
        .await
        .map_err(|err| {
            warn!(error = %err, locale, "news archive latest read failed");
            err
        })
        .ok()??;
        let fetched_at: DateTime<Utc> = row.get("fetched_at");
        let age = Utc::now().signed_duration_since(fetched_at);
        if age > ChronoDuration::from_std(ttl).unwrap_or(ChronoDuration::hours(4)) {
            return None;
        }
        let payload: serde_json::Value = row.get("payload");
        serde_json::from_value(payload)
            .map_err(|err| {
                warn!(error = %err, locale, "news archive latest decode failed");
                err
            })
            .ok()
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
            SELECT week_id, fetched_at
            FROM news_weeks
            WHERE locale = $1
            ORDER BY week_id DESC
            ",
        )
        .bind(locale)
        .fetch_all(pool)
        .await
        {
            Ok(rows) => {
                let weeks = rows
                    .into_iter()
                    .map(|row| {
                        let fetched_at: DateTime<Utc> = row.get("fetched_at");
                        NewsArchiveWeek {
                            week_id: row.get("week_id"),
                            fetched_at: fetched_at.to_rfc3339(),
                        }
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

    /// Full payload for one week, or `None` when missing / disabled.
    pub async fn get_week(&self, locale: &str, week_id: &str) -> Option<NewsResponse> {
        let pool = self.pool.as_ref()?;
        if !is_valid_week_id(week_id) {
            return None;
        }
        let row = sqlx::query(
            r"
            SELECT payload
            FROM news_weeks
            WHERE locale = $1 AND week_id = $2
            ",
        )
        .bind(locale)
        .bind(week_id)
        .fetch_optional(pool)
        .await
        .map_err(|err| {
            warn!(error = %err, locale, week_id, "news archive get failed");
            err
        })
        .ok()??;
        let payload: serde_json::Value = row.get("payload");
        serde_json::from_value(payload)
            .map_err(|err| {
                warn!(error = %err, locale, week_id, "news archive get decode failed");
                err
            })
            .ok()
    }
}

async fn migrate(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r"
        CREATE TABLE IF NOT EXISTS news_weeks (
            week_id TEXT NOT NULL,
            locale TEXT NOT NULL,
            fetched_at TIMESTAMPTZ NOT NULL,
            payload JSONB NOT NULL,
            PRIMARY KEY (week_id, locale)
        )
        ",
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn prune_old_weeks(pool: &PgPool, locale: &str) {
    let cutoff = Utc::now() - ChronoDuration::weeks(RETENTION_WEEKS);
    let cutoff_id = cutoff.format("%G-W%V").to_string();
    if let Err(err) = sqlx::query(
        r"
        DELETE FROM news_weeks
        WHERE locale = $1 AND week_id < $2
        ",
    )
    .bind(locale)
    .bind(&cutoff_id)
    .execute(pool)
    .await
    {
        warn!(error = %err, locale, cutoff_id, "news archive prune failed");
    }
}

/// ISO week id `YYYY-Www` from an RFC3339 `fetched_at` (UTC).
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

    #[tokio::test]
    async fn disabled_archive_returns_empty_list() {
        let archive = NewsArchive::default();
        let index = archive.list_weeks("en").await;
        assert_eq!(index.weeks.len(), 0);
        assert!(archive.get_week("en", "2026-W34").await.is_none());
        assert!(archive
            .load_latest_if_fresh("en", Duration::from_mins(1))
            .await
            .is_none());
    }
}

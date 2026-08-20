//! Greg Slack presence → chat live vs away.
//!
//! Live when presence is `active` and DND is not currently in effect.
//! Away when presence is not active, or DND is on now (in schedule window
//! and/or snooze), or custom status marks unavailable.
//!
//! `dnd_enabled` alone is not enough: Slack can leave it true while
//! `next_dnd_*` already points at the *next* night. Use the time window.

use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tokio::sync::RwLock;

/// Chat handoff mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum PresenceMode {
    Live,
    Away,
}

impl PresenceMode {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Live => "live",
            Self::Away => "away",
        }
    }

    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Live => "Online",
            Self::Away => "Away",
        }
    }
}

/// Snapshot returned to the widget.
#[derive(Debug, Clone, Serialize)]
pub struct PresenceSnapshot {
    pub mode: PresenceMode,
    pub label: &'static str,
    pub hero: &'static str,
}

impl PresenceSnapshot {
    #[must_use]
    pub const fn from_mode(mode: PresenceMode) -> Self {
        Self {
            mode,
            label: mode.label(),
            hero: match mode {
                PresenceMode::Live => "greg",
                PresenceMode::Away => "itcy",
            },
        }
    }
}

/// How presence is resolved.
#[derive(Clone)]
pub enum PresenceSource {
    /// Fixed mode (local / tests / missing Slack token).
    Fixed(PresenceMode),
    /// Slack presence + DND + status.
    Slack(Arc<SlackPresence>),
}

/// True when Slack custom status means unavailable (meeting, etc.).
#[must_use]
pub fn status_text_means_away(status_text: &str, status_emoji: &str) -> bool {
    let status = status_text.trim().to_ascii_lowercase();
    let emoji = status_emoji.trim().to_ascii_lowercase();
    if status.is_empty() && emoji.is_empty() {
        return false;
    }
    let blob = format!("{status} {emoji}");
    blob.contains("away")
        || blob.contains("dnd")
        || blob.contains("do not disturb")
        || blob.contains("meeting")
        || blob.contains("in a call")
        || emoji.contains("zzz")
        || emoji.contains("sleeping")
        || status_text.contains('\u{1F4A4}')
        || status_emoji.contains('\u{1F4A4}')
}

/// Live only when active and not DND-now and not away-status.
#[must_use]
pub const fn resolve_slack_mode(
    presence_active: bool,
    dnd_now: bool,
    status_away: bool,
) -> PresenceMode {
    if presence_active && !dnd_now && !status_away {
        PresenceMode::Live
    } else {
        PresenceMode::Away
    }
}

/// Unix seconds now (testable).
#[must_use]
pub fn unix_now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// DND currently in effect from `dnd.info`.
///
/// - snooze / Pause when the token exposes it
/// - else `dnd_enabled` **and** `now` inside `[next_dnd_start_ts, next_dnd_end_ts)`
#[must_use]
pub fn dnd_info_is_on(body: &serde_json::Value, now_secs: i64) -> bool {
    if body["ok"] != true {
        return false;
    }
    if body["snooze_enabled"] == true
        || body["snooze_remaining"]
            .as_i64()
            .is_some_and(|secs| secs > 0)
    {
        return true;
    }
    if body["dnd_enabled"] != true {
        return false;
    }
    let Some(start) = body["next_dnd_start_ts"].as_i64() else {
        return false;
    };
    let Some(end) = body["next_dnd_end_ts"].as_i64() else {
        return false;
    };
    start <= now_secs && now_secs < end
}

impl PresenceSource {
    /// Build from env: `CHAT_FORCE_MODE=live|away`, else Slack if token+user set, else away.
    #[must_use]
    pub fn from_env() -> Self {
        match std::env::var("CHAT_FORCE_MODE")
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str()
        {
            "live" => return Self::Fixed(PresenceMode::Live),
            "away" => return Self::Fixed(PresenceMode::Away),
            _ => {}
        }
        let token = std::env::var("SLACK_BOT_TOKEN").unwrap_or_default();
        let user = std::env::var("GREG_SLACK_USER_ID").unwrap_or_default();
        if token.is_empty() || user.is_empty() {
            tracing::info!("chat presence: no Slack token/user; default away");
            return Self::Fixed(PresenceMode::Away);
        }
        Self::Slack(Arc::new(SlackPresence {
            token,
            user_id: user,
            cache: RwLock::new(None),
        }))
    }

    /// Resolve current mode.
    pub async fn snapshot(&self) -> PresenceSnapshot {
        let mode = match self {
            Self::Fixed(m) => *m,
            Self::Slack(s) => s.resolve().await,
        };
        PresenceSnapshot::from_mode(mode)
    }
}

/// Slack presence client.
pub struct SlackPresence {
    token: String,
    user_id: String,
    cache: RwLock<Option<(Instant, PresenceMode)>>,
}

impl SlackPresence {
    /// Slack Pause can lag ~1m; no point hammering. Connect/message still refresh.
    const CACHE_TTL: Duration = Duration::from_secs(15);

    async fn resolve(&self) -> PresenceMode {
        if let Some(mode) = self.cached_mode().await {
            return mode;
        }
        let mode = self.resolve_fresh().await;
        *self.cache.write().await = Some((Instant::now(), mode));
        mode
    }

    async fn cached_mode(&self) -> Option<PresenceMode> {
        let guard = self.cache.read().await;
        let (at, mode) = (*guard)?;
        let hit = at.elapsed() < Self::CACHE_TTL;
        drop(guard);
        hit.then_some(mode)
    }

    async fn resolve_fresh(&self) -> PresenceMode {
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .build()
        {
            Ok(c) => c,
            Err(err) => {
                tracing::warn!(error = %err, "presence client build failed; away");
                return PresenceMode::Away;
            }
        };
        let presence_active = self.fetch_presence_active(&client).await;
        let dnd_now = self.fetch_dnd_now(&client).await;
        let status_away = self.fetch_status_away(&client).await;
        resolve_slack_mode(presence_active, dnd_now, status_away)
    }

    async fn fetch_presence_active(&self, client: &reqwest::Client) -> bool {
        let url = format!(
            "https://slack.com/api/users.getPresence?user={}",
            self.user_id
        );
        match client.get(&url).bearer_auth(&self.token).send().await {
            Ok(resp) => match resp.json::<serde_json::Value>().await {
                Ok(body) if body["ok"] == true => body["presence"].as_str() == Some("active"),
                Ok(body) => {
                    tracing::warn!(error = ?body.get("error"), "users.getPresence not ok; away");
                    false
                }
                Err(err) => {
                    tracing::warn!(error = %err, "presence parse failed; away");
                    false
                }
            },
            Err(err) => {
                tracing::warn!(error = %err, "presence request failed; away");
                false
            }
        }
    }

    async fn fetch_dnd_now(&self, client: &reqwest::Client) -> bool {
        let url = format!("https://slack.com/api/dnd.info?user={}", self.user_id);
        let Ok(resp) = client.get(url).bearer_auth(&self.token).send().await else {
            return false;
        };
        let Ok(body) = resp.json::<serde_json::Value>().await else {
            return false;
        };
        if body["ok"] != true {
            if body["error"].as_str() == Some("missing_scope") {
                tracing::warn!("dnd.info missing_scope (need dnd:read)");
            }
            return false;
        }
        dnd_info_is_on(&body, unix_now_secs())
    }

    async fn fetch_status_away(&self, client: &reqwest::Client) -> bool {
        let url = format!("https://slack.com/api/users.info?user={}", self.user_id);
        let Ok(resp) = client.get(url).bearer_auth(&self.token).send().await else {
            return false;
        };
        let Ok(body) = resp.json::<serde_json::Value>().await else {
            return false;
        };
        if body["ok"] != true {
            return false;
        }
        let status = body["user"]["profile"]["status_text"]
            .as_str()
            .unwrap_or("");
        let emoji = body["user"]["profile"]["status_emoji"]
            .as_str()
            .unwrap_or("");
        status_text_means_away(status, emoji)
    }
}

#[cfg(test)]
mod tests {
    use super::{dnd_info_is_on, resolve_slack_mode, status_text_means_away, PresenceMode};
    use serde_json::json;

    #[test]
    fn active_no_dnd_is_live() {
        assert_eq!(resolve_slack_mode(true, false, false), PresenceMode::Live);
    }

    #[test]
    fn dnd_or_offline_is_away() {
        assert_eq!(resolve_slack_mode(true, true, false), PresenceMode::Away);
        assert_eq!(resolve_slack_mode(false, false, false), PresenceMode::Away);
        assert_eq!(resolve_slack_mode(true, false, true), PresenceMode::Away);
    }

    #[test]
    fn dnd_enabled_outside_window_is_off() {
        // Greg active at ~23:58 with next window tomorrow 22:00–08:00
        let body = json!({
            "ok": true,
            "dnd_enabled": true,
            "next_dnd_start_ts": 1_786_996_800_i64,
            "next_dnd_end_ts": 1_787_032_800_i64
        });
        let now = 1_786_917_480_i64; // 2026-08-16 23:58 Paris
        assert!(!dnd_info_is_on(&body, now));
    }

    #[test]
    fn dnd_enabled_inside_window_is_on() {
        let body = json!({
            "ok": true,
            "dnd_enabled": true,
            "next_dnd_start_ts": 1_786_910_400_i64, // 22:00 same night
            "next_dnd_end_ts": 1_786_946_400_i64    // 08:00
        });
        let now = 1_786_917_480_i64; // 23:58
        assert!(dnd_info_is_on(&body, now));
    }

    #[test]
    fn snooze_is_on_even_outside_window() {
        let body = json!({
            "ok": true,
            "dnd_enabled": false,
            "snooze_enabled": true,
            "next_dnd_start_ts": 1_786_996_800_i64,
            "next_dnd_end_ts": 1_787_032_800_i64
        });
        assert!(dnd_info_is_on(&body, 1_786_917_480_i64));
    }

    #[test]
    fn empty_status_ok() {
        assert!(!status_text_means_away("", ""));
    }

    #[test]
    fn meeting_is_away() {
        assert!(status_text_means_away("In a meeting", ""));
    }
}

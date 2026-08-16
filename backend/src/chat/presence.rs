//! Greg Slack presence (live vs away).

use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use tokio::sync::RwLock;

/// Chat handoff mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
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
    /// Slack presence + paused notifications (DND) + custom status markers => away.
    Slack(Arc<SlackPresence>),
}

/// True when Slack `dnd.info` says notifications are paused / DND is on.
#[must_use]
pub fn dnd_info_means_away(body: &serde_json::Value) -> bool {
    if body["ok"] != true {
        return false;
    }
    if body["dnd_enabled"] == true {
        return true;
    }
    if body["snooze_enabled"] == true {
        return true;
    }
    false
}

/// True when Slack custom status should treat Greg as away despite `presence=active`.
#[must_use]
pub fn status_text_means_away(status_text: &str, status_emoji: &str) -> bool {
    let status = status_text.trim().to_ascii_lowercase();
    let emoji = status_emoji.trim().to_ascii_lowercase();
    if status.is_empty() && emoji.is_empty() {
        return false;
    }
    // Standalone Z / sleep markers (not every status that merely contains the letter "z").
    if is_z_sleep_marker(&status) {
        return true;
    }
    if emoji == ":z:"
        || emoji.contains("zzz")
        || emoji.contains("sleeping")
        || status_text.contains('\u{1F4A4}') // 💤
        || status_emoji.contains('\u{1F4A4}')
    {
        return true;
    }
    let blob = format!("{status} {emoji}");
    blob.contains("away")
        || blob.contains("dnd")
        || blob.contains("do not disturb")
        || blob.contains("meeting")
        || blob.contains("in a call")
}

/// `Z`, `Zz`, `zzz`, … only (not "organizing").
fn is_z_sleep_marker(status: &str) -> bool {
    !status.is_empty() && status.bytes().all(|b| b == b'z')
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
    /// Short TTL so WS connect + message + poller do not stampede Slack.
    cache: RwLock<Option<(Instant, PresenceMode)>>,
}

impl SlackPresence {
    const CACHE_TTL: Duration = Duration::from_secs(10);

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
        let url = format!(
            "https://slack.com/api/users.getPresence?user={}",
            self.user_id
        );
        let presence_online = match client.get(&url).bearer_auth(&self.token).send().await {
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
        };
        if !presence_online {
            return PresenceMode::Away;
        }
        if self.dnd_means_away(&client).await {
            return PresenceMode::Away;
        }
        if self.status_means_away(&client).await {
            return PresenceMode::Away;
        }
        PresenceMode::Live
    }

    /// Slack "Pause notifications" / DND (`dnd:read` required on the bot).
    async fn dnd_means_away(&self, client: &reqwest::Client) -> bool {
        let url = format!("https://slack.com/api/dnd.info?user={}", self.user_id);
        let Ok(resp) = client.get(url).bearer_auth(&self.token).send().await else {
            return false;
        };
        let Ok(body) = resp.json::<serde_json::Value>().await else {
            return false;
        };
        if body["ok"] != true {
            if body["error"].as_str() == Some("missing_scope") {
                tracing::warn!(
                    "dnd.info missing_scope (need dnd:read); paused notifications ignored"
                );
            }
            return false;
        }
        dnd_info_means_away(&body)
    }

    async fn status_means_away(&self, client: &reqwest::Client) -> bool {
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
    use super::{dnd_info_means_away, status_text_means_away};
    use serde_json::json;

    #[test]
    fn dnd_or_snooze_is_away() {
        assert!(dnd_info_means_away(&json!({
            "ok": true,
            "dnd_enabled": true,
            "snooze_enabled": false
        })));
        assert!(dnd_info_means_away(&json!({
            "ok": true,
            "dnd_enabled": false,
            "snooze_enabled": true
        })));
        assert!(!dnd_info_means_away(&json!({
            "ok": true,
            "dnd_enabled": false,
            "snooze_enabled": false
        })));
        assert!(!dnd_info_means_away(&json!({
            "ok": false,
            "error": "missing_scope"
        })));
    }

    #[test]
    fn empty_status_is_live() {
        assert!(!status_text_means_away("", ""));
        assert!(!status_text_means_away("  ", "  "));
    }

    #[test]
    fn letter_z_in_normal_words_is_not_away() {
        assert!(!status_text_means_away("organizing", ""));
        assert!(!status_text_means_away("amazing progress", ""));
        assert!(!status_text_means_away("focusing", ""));
    }

    #[test]
    fn z_and_zzz_are_away() {
        assert!(status_text_means_away("Z", ""));
        assert!(status_text_means_away("Zz", ""));
        assert!(status_text_means_away("zzz", ""));
        assert!(status_text_means_away("", ":zzz:"));
        assert!(status_text_means_away("", ":Zzz:"));
        assert!(status_text_means_away("", ":sleeping:"));
        assert!(status_text_means_away("napping \u{1F4A4}", ""));
    }

    #[test]
    fn away_dnd_meeting_are_away() {
        assert!(status_text_means_away("Away", ""));
        assert!(status_text_means_away("brb - away", ""));
        assert!(status_text_means_away("DND", ""));
        assert!(status_text_means_away("Do not disturb", ""));
        assert!(status_text_means_away("In a meeting", ""));
        assert!(status_text_means_away("On a meeting call", ":calendar:"));
        assert!(status_text_means_away("In a call", ""));
    }
}

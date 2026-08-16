//! Greg Slack presence (live vs away).

use std::sync::Arc;

use serde::Serialize;

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
    /// Slack `users.getPresence` + status text (Z / away / DND => away).
    Slack(Arc<SlackPresence>),
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
}

impl SlackPresence {
    async fn resolve(&self) -> PresenceMode {
        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
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
        if self.status_means_away(&client).await {
            return PresenceMode::Away;
        }
        PresenceMode::Live
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
            .unwrap_or("")
            .to_ascii_lowercase();
        let emoji = body["user"]["profile"]["status_emoji"]
            .as_str()
            .unwrap_or("")
            .to_ascii_lowercase();
        let blob = format!("{status} {emoji}");
        blob.contains('z')
            || blob.contains("away")
            || blob.contains("dnd")
            || blob.contains("zzz")
            || emoji.contains("zzz")
    }
}

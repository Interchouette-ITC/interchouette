//! Slack DM relay to Greg (durable store for chat).

use std::sync::Arc;

use serde_json::json;

/// Posts visitor traffic into the bot↔Greg DM. No-op when not configured.
#[derive(Clone)]
pub struct SlackRelay {
    inner: Option<Arc<SlackInner>>,
}

struct SlackInner {
    token: String,
    greg_user_id: String,
    client: reqwest::Client,
}

impl SlackRelay {
    /// From env `SLACK_BOT_TOKEN` + `GREG_SLACK_USER_ID`.
    #[must_use]
    pub fn from_env() -> Self {
        let token = std::env::var("SLACK_BOT_TOKEN").unwrap_or_default();
        let greg_user_id = std::env::var("GREG_SLACK_USER_ID").unwrap_or_default();
        if token.is_empty() || greg_user_id.is_empty() {
            tracing::info!("chat Slack relay disabled (missing token or GREG_SLACK_USER_ID)");
            return Self { inner: None };
        }
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            inner: Some(Arc::new(SlackInner {
                token,
                greg_user_id,
                client,
            })),
        }
    }

    #[must_use]
    pub const fn enabled(&self) -> bool {
        self.inner.is_some()
    }

    /// Open (or reuse) DM channel with Greg.
    ///
    /// # Errors
    /// Returns when Slack API fails.
    pub async fn open_dm(&self) -> anyhow::Result<String> {
        let Some(inner) = &self.inner else {
            anyhow::bail!("slack relay not configured");
        };
        let resp = inner
            .client
            .post("https://slack.com/api/conversations.open")
            .bearer_auth(&inner.token)
            .json(&json!({ "users": inner.greg_user_id }))
            .send()
            .await?;
        let body: serde_json::Value = resp.json().await?;
        if body["ok"] != true {
            anyhow::bail!(
                "conversations.open: {}",
                body["error"].as_str().unwrap_or("unknown")
            );
        }
        body["channel"]["id"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| anyhow::anyhow!("conversations.open missing channel.id"))
    }

    /// Post a tagged line into Greg's DM.
    pub async fn post_session_line(
        &self,
        short_code: &str,
        kind: &str,
        text: &str,
    ) -> anyhow::Result<()> {
        let Some(inner) = &self.inner else {
            tracing::debug!(%short_code, %kind, "slack skipped (disabled)");
            return Ok(());
        };
        let channel = self.open_dm().await?;
        let message = format!("[{short_code}] {kind}: {text}");
        let resp = inner
            .client
            .post("https://slack.com/api/chat.postMessage")
            .bearer_auth(&inner.token)
            .json(&json!({
                "channel": channel,
                "text": message,
            }))
            .send()
            .await?;
        let body: serde_json::Value = resp.json().await?;
        if body["ok"] != true {
            anyhow::bail!(
                "chat.postMessage: {}",
                body["error"].as_str().unwrap_or("unknown")
            );
        }
        Ok(())
    }

    /// Away-mode lead summary so nothing is lost when `ITCy` answers.
    pub async fn post_lead(
        &self,
        short_code: &str,
        visitor_text: &str,
        itcy_reply: &str,
        email: Option<&str>,
    ) -> anyhow::Result<()> {
        let email_bit = email.unwrap_or("(none)");
        let summary =
            format!("Away lead\nVisitor: {visitor_text}\nITCy: {itcy_reply}\nEmail: {email_bit}");
        self.post_session_line(short_code, "LEAD", &summary).await
    }
}

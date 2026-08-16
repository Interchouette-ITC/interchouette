//! Slack DM + per-session threads (durable store for chat).

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

/// Result of opening / posting into a session thread.
#[derive(Debug, Clone)]
pub struct ThreadRef {
    pub channel: String,
    pub thread_ts: String,
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

    /// Start a Slack thread for a visitor session (parent message).
    pub async fn start_session_thread(
        &self,
        short_code: &str,
        mode: &str,
    ) -> anyhow::Result<ThreadRef> {
        let channel = self.open_dm().await?;
        let text = format!("[{short_code}] mode={mode}");
        let ts = self.post_raw(&channel, None, &text).await?;
        Ok(ThreadRef {
            channel,
            thread_ts: ts,
        })
    }

    /// Post into an existing session thread (or top-level if no thread yet).
    pub async fn post_in_thread(
        &self,
        channel: &str,
        thread_ts: Option<&str>,
        text: &str,
    ) -> anyhow::Result<String> {
        self.post_raw(channel, thread_ts, text).await
    }

    /// Convenience: open DM and post a top-level tagged line (resume / probes).
    pub async fn post_session_line(
        &self,
        short_code: &str,
        kind: &str,
        text: &str,
    ) -> anyhow::Result<()> {
        let Some(_inner) = &self.inner else {
            tracing::debug!(%short_code, %kind, "slack skipped (disabled)");
            return Ok(());
        };
        let channel = self.open_dm().await?;
        let message = format!("[{short_code}] {kind}: {text}");
        let _ = self.post_raw(&channel, None, &message).await?;
        Ok(())
    }

    async fn post_raw(
        &self,
        channel: &str,
        thread_ts: Option<&str>,
        text: &str,
    ) -> anyhow::Result<String> {
        let Some(inner) = &self.inner else {
            anyhow::bail!("slack relay not configured");
        };
        let mut payload = json!({
            "channel": channel,
            "text": text,
        });
        if let Some(ts) = thread_ts {
            payload["thread_ts"] = json!(ts);
        }
        let resp = inner
            .client
            .post("https://slack.com/api/chat.postMessage")
            .bearer_auth(&inner.token)
            .json(&payload)
            .send()
            .await?;
        let body: serde_json::Value = resp.json().await?;
        if body["ok"] != true {
            anyhow::bail!(
                "chat.postMessage: {}",
                body["error"].as_str().unwrap_or("unknown")
            );
        }
        body["ts"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| anyhow::anyhow!("chat.postMessage missing ts"))
    }
}

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
    ///
    /// `CHAT_ENV=local` never opens Slack (agent restarts must not spam Greg's DM).
    /// Prod and e2e still relay when tokens are set.
    #[must_use]
    pub fn from_env() -> Self {
        let env = crate::chat::chat_env_label();
        if !crate::chat::env_label::slack_relay_allowed(&env) {
            tracing::info!(%env, "chat Slack relay disabled (local env)");
            return Self { inner: None };
        }
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
        let env = crate::chat::chat_env_label();
        let text = crate::chat::env_label::format_session_thread_header(short_code, mode, &env);
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

    #[must_use]
    pub fn greg_user_id(&self) -> Option<&str> {
        self.inner.as_ref().map(|inner| inner.greg_user_id.as_str())
    }

    /// Parent line of a Slack thread (session header with `[ticket]`).
    pub async fn thread_parent_text(
        &self,
        channel: &str,
        thread_ts: &str,
    ) -> anyhow::Result<String> {
        let Some(inner) = &self.inner else {
            anyhow::bail!("slack relay not configured");
        };
        let url = format!(
            "https://slack.com/api/conversations.replies?channel={channel}&ts={thread_ts}&limit=1"
        );
        let resp = inner
            .client
            .get(url)
            .bearer_auth(&inner.token)
            .send()
            .await?;
        let body: serde_json::Value = resp.json().await?;
        if body["ok"] != true {
            anyhow::bail!(
                "conversations.replies: {}",
                body["error"].as_str().unwrap_or("unknown")
            );
        }
        body["messages"][0]["text"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| anyhow::anyhow!("conversations.replies missing parent text"))
    }

    /// Greg replies in a session thread. Skips the parent header and bot lines.
    pub async fn greg_thread_replies(
        &self,
        channel: &str,
        thread_ts: &str,
    ) -> anyhow::Result<Vec<(String, String)>> {
        let Some(inner) = &self.inner else {
            anyhow::bail!("slack relay not configured");
        };
        let url = format!(
            "https://slack.com/api/conversations.replies?channel={channel}&ts={thread_ts}&limit=200"
        );
        let resp = inner
            .client
            .get(url)
            .bearer_auth(&inner.token)
            .send()
            .await?;
        let body: serde_json::Value = resp.json().await?;
        if body["ok"] != true {
            anyhow::bail!(
                "conversations.replies: {}",
                body["error"].as_str().unwrap_or("unknown")
            );
        }
        let greg = inner.greg_user_id.as_str();
        let mut out = Vec::new();
        let Some(messages) = body["messages"].as_array() else {
            return Ok(out);
        };
        for msg in messages {
            let Some(ts) = msg["ts"].as_str() else {
                continue;
            };
            if ts == thread_ts {
                continue;
            }
            if msg.get("bot_id").is_some() {
                continue;
            }
            if msg["user"].as_str() != Some(greg) {
                continue;
            }
            let Some(text) = msg["text"]
                .as_str()
                .map(str::trim)
                .filter(|t| !t.is_empty())
            else {
                continue;
            };
            out.push((ts.to_string(), text.to_string()));
        }
        Ok(out)
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

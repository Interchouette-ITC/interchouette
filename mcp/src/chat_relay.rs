//! Slack DM relay for token-gated MCP chat tools.

use serde_json::json;

/// Posts a DM to Greg when Slack + chat token are configured.
#[derive(Clone)]
pub struct ChatRelay {
    expected_token: Option<String>,
    bot_token: Option<String>,
    greg_user_id: Option<String>,
    client: reqwest::Client,
}

impl ChatRelay {
    /// From `MCP_CHAT_TOKEN`, `SLACK_BOT_TOKEN`, `GREG_SLACK_USER_ID`.
    #[must_use]
    pub fn from_env() -> Self {
        let expected_token = nonempty_env("MCP_CHAT_TOKEN");
        let bot_token = nonempty_env("SLACK_BOT_TOKEN");
        let greg_user_id = nonempty_env("GREG_SLACK_USER_ID");
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            expected_token,
            bot_token,
            greg_user_id,
            client,
        }
    }

    #[must_use]
    pub const fn token_configured(&self) -> bool {
        self.expected_token.is_some()
    }

    #[must_use]
    pub const fn slack_configured(&self) -> bool {
        self.bot_token.is_some() && self.greg_user_id.is_some()
    }

    /// Test helper with a fixed expected token (Slack unset).
    #[cfg(test)]
    #[must_use]
    pub fn for_test(expected_token: Option<&str>) -> Self {
        Self {
            expected_token: expected_token.map(str::to_string),
            bot_token: None,
            greg_user_id: None,
            client: reqwest::Client::new(),
        }
    }

    /// True when `token` matches `MCP_CHAT_TOKEN`.
    #[must_use]
    pub fn authorize(&self, token: &str) -> bool {
        self.expected_token
            .as_ref()
            .is_some_and(|expected| !token.is_empty() && token == expected)
    }

    /// Open Greg DM and post `text`.
    ///
    /// # Errors
    /// Returns when Slack is unset or the API fails.
    pub async fn post_to_greg(&self, text: &str) -> anyhow::Result<()> {
        let Some(bot) = &self.bot_token else {
            anyhow::bail!("SLACK_BOT_TOKEN is not set");
        };
        let Some(greg) = &self.greg_user_id else {
            anyhow::bail!("GREG_SLACK_USER_ID is not set");
        };
        let open = self
            .client
            .post("https://slack.com/api/conversations.open")
            .bearer_auth(bot)
            .json(&json!({ "users": greg }))
            .send()
            .await?;
        let open_body: serde_json::Value = open.json().await?;
        if open_body["ok"] != true {
            anyhow::bail!(
                "conversations.open: {}",
                open_body["error"].as_str().unwrap_or("unknown")
            );
        }
        let channel = open_body["channel"]["id"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("conversations.open missing channel.id"))?;
        let post = self
            .client
            .post("https://slack.com/api/chat.postMessage")
            .bearer_auth(bot)
            .json(&json!({ "channel": channel, "text": text }))
            .send()
            .await?;
        let post_body: serde_json::Value = post.json().await?;
        if post_body["ok"] != true {
            anyhow::bail!(
                "chat.postMessage: {}",
                post_body["error"].as_str().unwrap_or("unknown")
            );
        }
        Ok(())
    }
}

fn nonempty_env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorize_requires_matching_token() {
        let relay = ChatRelay {
            expected_token: Some("secret".into()),
            bot_token: None,
            greg_user_id: None,
            client: reqwest::Client::new(),
        };
        assert!(!relay.authorize(""));
        assert!(!relay.authorize("wrong"));
        assert!(relay.authorize("secret"));
    }
}

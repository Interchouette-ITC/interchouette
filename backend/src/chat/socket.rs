//! Slack Socket Mode inbound: Greg DM replies → live WebSocket sessions.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use uuid::Uuid;

use crate::chat::hub::ChatEvent;
use crate::chat::reply_parse::parse_session_reply;
use crate::chat::ChatState;

/// Apply a Greg Slack message body to a live session when tagged `[S-XXXX]`.
///
/// Returns `true` when a live session received the reply.
pub async fn forward_greg_reply(state: &ChatState, text: &str) -> bool {
    let Some((code, body)) = parse_session_reply(text) else {
        tracing::debug!("Greg DM without [S-XXXX] tag; ignored");
        return false;
    };
    let Some(session) = state.sessions.get_by_code(&code).await else {
        tracing::debug!(%code, "no live session for Greg reply");
        let _ = state
            .slack
            .post_session_line(
                &code,
                "SYSTEM",
                "No live browser session for that code (visitor left or server restarted).",
            )
            .await;
        return false;
    };
    state
        .hub
        .publish(
            &session.id,
            ChatEvent::Message {
                id: Uuid::new_v4().to_string(),
                role: "greg".into(),
                text: body,
            },
        )
        .await;
    tracing::info!(%code, session = %session.id, "forwarded Greg Slack reply to WS");
    true
}

/// Spawn the Socket Mode loop when `SLACK_APP_TOKEN` + bot + Greg id are set.
pub fn spawn_inbound(state: ChatState) {
    let Some(cfg) = SocketConfig::from_env() else {
        tracing::info!("chat Slack Socket Mode disabled (need SLACK_APP_TOKEN + bot + Greg id)");
        return;
    };
    tracing::info!("chat Slack Socket Mode starting");
    tokio::spawn(async move {
        loop {
            if let Err(err) = run_once(&state, &cfg).await {
                tracing::warn!(error = %err, "Slack Socket Mode disconnected; retrying");
            }
            tokio::time::sleep(Duration::from_secs(3)).await;
        }
    });
}

struct SocketConfig {
    app_token: String,
    greg_user_id: String,
    client: reqwest::Client,
}

impl SocketConfig {
    fn from_env() -> Option<Self> {
        let app_token = std::env::var("SLACK_APP_TOKEN")
            .ok()
            .filter(|s| !s.is_empty())?;
        let _bot = std::env::var("SLACK_BOT_TOKEN")
            .ok()
            .filter(|s| !s.is_empty())?;
        let greg_user_id = std::env::var("GREG_SLACK_USER_ID")
            .ok()
            .filter(|s| !s.is_empty())?;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Some(Self {
            app_token,
            greg_user_id,
            client,
        })
    }

    #[must_use]
    pub fn configured() -> bool {
        Self::from_env().is_some()
    }
}

async fn run_once(state: &ChatState, cfg: &SocketConfig) -> anyhow::Result<()> {
    let url = open_connection(cfg).await?;
    let (ws, _) = connect_async(&url).await?;
    let (mut write, mut read) = ws.split();
    tracing::info!("Slack Socket Mode connected");

    while let Some(frame) = read.next().await {
        let frame = frame?;
        let Message::Text(text) = frame else {
            continue;
        };
        let envelope: Value = serde_json::from_str(&text)?;
        if let Some(envelope_id) = envelope["envelope_id"].as_str() {
            let ack = json!({ "envelope_id": envelope_id });
            write.send(Message::Text(ack.to_string().into())).await?;
        }
        if envelope["type"].as_str() == Some("disconnect") {
            anyhow::bail!("server requested disconnect");
        }
        handle_envelope(state, cfg, &envelope).await;
    }
    anyhow::bail!("socket closed")
}

async fn open_connection(cfg: &SocketConfig) -> anyhow::Result<String> {
    let resp = cfg
        .client
        .post("https://slack.com/api/apps.connections.open")
        .bearer_auth(&cfg.app_token)
        .send()
        .await?;
    let body: Value = resp.json().await?;
    if body["ok"] != true {
        anyhow::bail!(
            "apps.connections.open: {}",
            body["error"].as_str().unwrap_or("unknown")
        );
    }
    body["url"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| anyhow::anyhow!("apps.connections.open missing url"))
}

async fn handle_envelope(state: &ChatState, cfg: &SocketConfig, envelope: &Value) {
    if envelope["type"].as_str() != Some("events_api") {
        return;
    }
    let event = &envelope["payload"]["event"];
    if event["type"].as_str() != Some("message") {
        return;
    }
    if event.get("bot_id").is_some() || event.get("subtype").is_some() {
        return;
    }
    let Some(user) = event["user"].as_str() else {
        return;
    };
    if user != cfg.greg_user_id {
        return;
    }
    let Some(text) = event["text"].as_str() else {
        return;
    };
    let _ = forward_greg_reply(state, text).await;
}

/// Whether Socket Mode env is complete.
#[must_use]
pub fn socket_configured() -> bool {
    SocketConfig::configured()
}

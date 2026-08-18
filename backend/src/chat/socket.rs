//! Slack Socket Mode inbound: Greg thread replies → live WebSocket sessions.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::chat::reply_parse::{parse_session_header, parse_session_reply};
use crate::chat::sessions::Session;
use crate::chat::ChatState;

/// Apply a Greg Slack message to a live session.
///
/// Prefer thread parent `ts` (normal flow). Fall back to Slack thread header lookup,
/// then a leftover `[ticket]` tag.
///
/// Returns `true` when a live session received the reply.
pub async fn forward_greg_reply(
    state: &ChatState,
    text: &str,
    thread_ts: Option<&str>,
    channel: Option<&str>,
) -> bool {
    if let Some(ts) = thread_ts.filter(|t| !t.is_empty()) {
        if let Some(session) = state.sessions.get_by_thread(ts).await {
            publish_greg(state, &session.id, text).await;
            tracing::info!(
                code = %session.short_code,
                session = %session.id,
                %ts,
                "forwarded Greg thread reply to WS"
            );
            return true;
        }
        if let (Some(ch), Some(ts)) = (channel.filter(|c| !c.is_empty()), Some(ts)) {
            if let Some(session) = resolve_session_via_slack_thread(state, ch, ts).await {
                publish_greg(state, &session.id, text).await;
                tracing::info!(
                    code = %session.short_code,
                    session = %session.id,
                    %ts,
                    "forwarded Greg reply via Slack thread header lookup"
                );
                return true;
            }
        }
    }

    let Some((code, body)) = parse_session_reply(text) else {
        tracing::warn!(
            ?thread_ts,
            ?channel,
            preview = %text.chars().take(120).collect::<String>(),
            "Greg Slack reply not forwarded (no thread match or ticket tag)"
        );
        return false;
    };
    let Some(session) = state.sessions.get_by_code(&code).await else {
        tracing::warn!(
            %code,
            "Greg tagged Slack reply but no live session on this backend"
        );
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
    publish_greg(state, &session.id, &body).await;
    tracing::info!(%code, session = %session.id, "forwarded Greg tagged reply to WS");
    true
}

async fn resolve_session_via_slack_thread(
    state: &ChatState,
    channel: &str,
    thread_ts: &str,
) -> Option<Session> {
    let parent = state
        .slack
        .thread_parent_text(channel, thread_ts)
        .await
        .inspect_err(|err| {
            tracing::warn!(error = %err, %channel, %thread_ts, "Slack thread parent lookup failed");
        })
        .ok()?;
    let (code, env) = parse_session_header(&parent)?;
    let ours = crate::chat::chat_env_label();
    if !env.is_empty() && env != ours {
        tracing::debug!(%code, %env, %ours, "Greg thread belongs to another chat env; skipping");
        return None;
    }
    let session = state.sessions.get_by_code(&code).await?;
    state
        .sessions
        .set_slack_thread(&session.id, channel.to_string(), thread_ts.to_string())
        .await;
    Some(session)
}

async fn publish_greg(state: &ChatState, session_id: &str, text: &str) {
    state.push_message(session_id, "greg", text).await;
}

/// Start Slack inbound: Socket Mode on prod, HTTP thread read otherwise.
pub fn spawn_inbound(state: ChatState) {
    if crate::chat::chat_env_label() == "prod" {
        spawn_socket_mode(state);
        return;
    }
    spawn_thread_reader(state);
}

fn spawn_socket_mode(state: ChatState) {
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

fn spawn_thread_reader(state: ChatState) {
    if !state.slack.enabled() {
        tracing::info!("chat Slack thread reader disabled (missing bot token or Greg id)");
        return;
    }
    tracing::info!("chat Slack thread reader starting");
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(2));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            read_open_threads(&state).await;
        }
    });
}

async fn read_open_threads(state: &ChatState) {
    for (session_id, channel, thread_ts) in state.sessions.slack_threads().await {
        let replies = match state.slack.greg_thread_replies(&channel, &thread_ts).await {
            Ok(replies) => replies,
            Err(err) => {
                tracing::debug!(error = %err, %session_id, "Slack thread read failed");
                continue;
            }
        };
        for (ts, text) in replies {
            let _ = state
                .try_push_message(&session_id, &ts, "greg", &text)
                .await;
        }
    }
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
    let channel = event["channel"].as_str();
    // Thread replies carry `thread_ts`. Parent messages use their own `ts`.
    let thread_ts = event["thread_ts"].as_str().or_else(|| event["ts"].as_str());
    let _ = forward_greg_reply(state, text, thread_ts, channel).await;
}

/// Whether this process will open Slack Socket Mode (prod only).
#[must_use]
pub fn socket_configured() -> bool {
    crate::chat::chat_env_label() == "prod" && SocketConfig::configured()
}

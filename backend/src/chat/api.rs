//! HTTP + WebSocket chat routes.

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{Path, State, WebSocketUpgrade};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::chat::hub::{ChatEvent, Hub};
use crate::chat::llm::AwayBrain;
use crate::chat::presence::{PresenceMode, PresenceSource};
use crate::chat::sessions::{Session, SessionRegistry};
use crate::chat::slack::SlackRelay;

/// Shared chat runtime.
#[derive(Clone)]
pub struct ChatState {
    pub sessions: SessionRegistry,
    pub hub: Hub,
    pub presence: PresenceSource,
    pub slack: SlackRelay,
    pub away: AwayBrain,
}

impl ChatState {
    /// Build chat state from env.
    #[must_use]
    pub fn new(away: AwayBrain) -> Self {
        Self {
            sessions: SessionRegistry::default(),
            hub: Hub::default(),
            presence: PresenceSource::from_env(),
            slack: SlackRelay::from_env(),
            away,
        }
    }

    /// Start Slack Socket Mode so Greg DM replies reach live browsers.
    pub fn spawn_background_tasks(&self) {
        crate::chat::socket::spawn_inbound(self.clone());
    }
}

#[derive(Debug, Serialize)]
struct CreateSessionResponse {
    session_id: String,
    short_code: String,
    mode: PresenceMode,
    label: &'static str,
    hero: &'static str,
}

#[derive(Debug, Deserialize)]
struct ClientWsMessage {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
    email: Option<String>,
    /// When `false`, bind email on the session but do not post to Slack.
    #[serde(default = "default_announce")]
    announce: bool,
}

const fn default_announce() -> bool {
    true
}

/// Mount chat routes under `/v1`.
pub fn chat_router(state: ChatState) -> Router {
    Router::new()
        .route("/v1/presence", get(get_presence))
        .route("/v1/sessions", post(create_session))
        .route("/v1/sessions/{id}/ws", get(ws_upgrade))
        .route("/ready", get(ready))
        .with_state(state)
}

async fn ready(State(state): State<ChatState>) -> impl IntoResponse {
    Json(json!({
        "ok": true,
        "chat": true,
        "slack": state.slack.enabled(),
        "slack_socket": crate::chat::socket_configured(),
    }))
}

async fn get_presence(State(state): State<ChatState>) -> impl IntoResponse {
    let snap = state.presence.snapshot().await;
    Json(json!({
        "mode": snap.mode,
        "label": snap.label,
        "hero": snap.hero,
    }))
}

async fn create_session(State(state): State<ChatState>) -> impl IntoResponse {
    let snap = state.presence.snapshot().await;
    let session = state.sessions.create(snap.mode).await;
    // Slack thread starts on the first visitor message (avoid flood on open/refresh).
    Json(CreateSessionResponse {
        session_id: session.id,
        short_code: session.short_code,
        mode: snap.mode,
        label: snap.label,
        hero: snap.hero,
    })
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    Path(id): Path<String>,
    State(state): State<ChatState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, id, state))
}

async fn handle_socket(socket: WebSocket, session_id: String, state: ChatState) {
    let Some(session) = state.sessions.get(&session_id).await else {
        let (mut sender, _) = socket.split();
        let _ = sender
            .send(Message::Text(
                serde_json::to_string(&ChatEvent::Error {
                    message: "unknown session".into(),
                })
                .unwrap_or_default()
                .into(),
            ))
            .await;
        return;
    };

    let mut rx = state.hub.subscribe(&session_id).await;
    let (mut sender, mut receiver) = socket.split();

    let ready = ChatEvent::Ready {
        session_id: session.id.clone(),
        short_code: session.short_code.clone(),
        mode: session.mode.as_str().into(),
    };
    let _ = sender
        .send(Message::Text(
            serde_json::to_string(&ready).unwrap_or_default().into(),
        ))
        .await;
    let _ = sender
        .send(Message::Text(
            serde_json::to_string(&ChatEvent::Presence {
                mode: session.mode.as_str().into(),
                label: session.mode.label().into(),
            })
            .unwrap_or_default()
            .into(),
        ))
        .await;

    let mut send_task = tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            let Ok(text) = serde_json::to_string(&event) else {
                continue;
            };
            if sender.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });

    let recv_state = state.clone();
    let recv_id = session_id;
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if let Ok(parsed) = serde_json::from_str::<ClientWsMessage>(&text) {
                        handle_client_msg(&recv_state, &recv_id, parsed).await;
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }
}

async fn handle_client_msg(state: &ChatState, session_id: &str, msg: ClientWsMessage) {
    let Some(session) = state.sessions.get(session_id).await else {
        return;
    };
    match msg.kind.as_str() {
        "email" => {
            if let Some(email) = msg
                .email
                .map(|e| e.trim().to_string())
                .filter(|e| !e.is_empty())
            {
                let unchanged = session
                    .visitor_email
                    .as_ref()
                    .is_some_and(|prev| prev.eq_ignore_ascii_case(&email));
                state.sessions.set_email(session_id, email.clone()).await;
                if msg.announce && !unchanged {
                    let _ =
                        post_to_session_thread(state, &session, &format!("EMAIL: {email}")).await;
                }
            }
        }
        "message" => {
            let Some(text) = msg
                .text
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
            else {
                return;
            };
            publish_role(state, session_id, "visitor", &text).await;
            match session.mode {
                PresenceMode::Live => {
                    handle_live(state, &session, session_id, &text).await;
                }
                PresenceMode::Away => {
                    handle_away(state, &session, session_id, &text).await;
                }
            }
        }
        _ => {}
    }
}

async fn publish_role(state: &ChatState, session_id: &str, role: &str, text: &str) {
    state
        .hub
        .publish(
            session_id,
            ChatEvent::Message {
                id: Uuid::new_v4().to_string(),
                role: role.into(),
                text: text.into(),
            },
        )
        .await;
}

async fn ensure_session_thread(state: &ChatState, session: &Session) -> Option<(String, String)> {
    if let (Some(channel), Some(ts)) = (&session.slack_channel, &session.slack_thread_ts) {
        return Some((channel.clone(), ts.clone()));
    }
    if !state.slack.enabled() {
        return None;
    }
    match state
        .slack
        .start_session_thread(&session.short_code, session.mode.as_str())
        .await
    {
        Ok(thread) => {
            state
                .sessions
                .set_slack_thread(
                    &session.id,
                    thread.channel.clone(),
                    thread.thread_ts.clone(),
                )
                .await;
            Some((thread.channel, thread.thread_ts))
        }
        Err(err) => {
            tracing::warn!(error = %err, "ensure Slack session thread failed");
            None
        }
    }
}

async fn post_to_session_thread(
    state: &ChatState,
    session: &Session,
    text: &str,
) -> anyhow::Result<()> {
    let Some((channel, thread_ts)) = ensure_session_thread(state, session).await else {
        return Ok(());
    };
    let _ = state
        .slack
        .post_in_thread(&channel, Some(&thread_ts), text)
        .await?;
    Ok(())
}

async fn handle_live(state: &ChatState, session: &Session, session_id: &str, text: &str) {
    let _ = post_to_session_thread(state, session, &format!("Prospect: {text}")).await;
    publish_role(
        state,
        session_id,
        "system",
        "Message sent. Greg will reply here, usually within minutes.",
    )
    .await;
}

async fn handle_away(state: &ChatState, session: &Session, session_id: &str, text: &str) {
    let _ = post_to_session_thread(state, session, &format!("Prospect: {text}")).await;
    state
        .hub
        .publish(
            session_id,
            ChatEvent::Typing {
                who: "itcy".into(),
                active: true,
            },
        )
        .await;
    let reply = state.away.reply(text).await;
    state
        .hub
        .publish(
            session_id,
            ChatEvent::Typing {
                who: "itcy".into(),
                active: false,
            },
        )
        .await;
    publish_role(state, session_id, "itcy", &reply).await;
    let email = state
        .sessions
        .get(session_id)
        .await
        .and_then(|s| s.visitor_email);
    let mirror = email.map_or_else(
        || format!("ITCy: {reply}"),
        |e| format!("ITCy: {reply}\n(visitor email: {e})"),
    );
    let _ = post_to_session_thread(state, session, &mirror).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn test_state() -> ChatState {
        ChatState {
            sessions: SessionRegistry::default(),
            hub: Hub::default(),
            presence: PresenceSource::Fixed(PresenceMode::Away),
            slack: SlackRelay::from_env(),
            away: AwayBrain::with_static_context(
                "### Test\nInterchouette Rust chat test knowledge.",
            ),
        }
    }

    #[tokio::test]
    async fn create_session_returns_away() {
        let state = test_state();
        let app = chat_router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/sessions")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["mode"], "away");
        assert!(body["session_id"].as_str().unwrap().len() > 10);
        assert!(body["short_code"].as_str().unwrap().starts_with("IC-"));
    }

    #[tokio::test]
    async fn presence_endpoint() {
        let state = test_state();
        let app = chat_router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/v1/presence")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["hero"], "itcy");
    }

    #[tokio::test]
    async fn greg_tagged_reply_reaches_hub() {
        let state = test_state();
        let session = state.sessions.create(PresenceMode::Live).await;
        let mut rx = state.hub.subscribe(&session.id).await;
        let tagged = format!("[{}] hello from Greg", session.short_code);
        assert!(crate::chat::forward_greg_reply(&state, &tagged, None).await);
        let event = rx.recv().await.expect("hub event");
        match event {
            ChatEvent::Message { role, text, .. } => {
                assert_eq!(role, "greg");
                assert_eq!(text, "hello from Greg");
            }
            other => panic!("unexpected event: {other:?}"),
        }
    }

    #[tokio::test]
    async fn greg_thread_reply_reaches_hub() {
        let state = test_state();
        let session = state.sessions.create(PresenceMode::Live).await;
        state
            .sessions
            .set_slack_thread(&session.id, "D1".into(), "171.999".into())
            .await;
        let mut rx = state.hub.subscribe(&session.id).await;
        assert!(
            crate::chat::forward_greg_reply(&state, "hello from thread", Some("171.999")).await
        );
        let event = rx.recv().await.expect("hub event");
        match event {
            ChatEvent::Message { role, text, .. } => {
                assert_eq!(role, "greg");
                assert_eq!(text, "hello from thread");
            }
            other => panic!("unexpected event: {other:?}"),
        }
    }
}

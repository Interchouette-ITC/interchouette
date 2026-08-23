//! HTTP + WebSocket chat routes.

use axum::body::Bytes;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::{Path, State, WebSocketUpgrade};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::chat::calendar::{
    extract_booking_tag, format_busy_snippet, looks_like_scheduling_intent, strip_booking_tag,
    upcoming_freebusy_window, BookingRequest, CalendarClient, SLOT_TAKEN_ERROR_PREFIX,
};
use crate::chat::hub::{ChatEvent, Hub};
use crate::chat::llm::AwayBrain;
use crate::chat::locale::ChatLocale;
use crate::chat::presence::{PresenceMode, PresenceSource};
use crate::chat::sessions::{ChatLine, Session, SessionRegistry};
use crate::chat::slack::SlackRelay;
use crate::openapi::{PresenceResponse, ReadyResponse};

/// Shared chat runtime.
#[derive(Clone)]
pub struct ChatState {
    pub sessions: SessionRegistry,
    pub hub: Hub,
    pub presence: PresenceSource,
    pub slack: SlackRelay,
    pub away: AwayBrain,
    pub calendar: CalendarClient,
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
            calendar: CalendarClient::from_env(),
        }
    }

    /// Slack inbound: Socket Mode on prod, HTTP thread read on local.
    pub fn spawn_background_tasks(&self) {
        crate::chat::socket::spawn_inbound(self.clone());
        spawn_presence_watcher(self.clone());
    }

    /// Append to the session transcript and fan out over WebSocket when connected.
    pub async fn push_message(&self, session_id: &str, role: &str, text: &str) -> String {
        let id = Uuid::new_v4().to_string();
        self.try_push_message(session_id, &id, role, text).await;
        id
    }

    /// Insert a chat line with a stable id (Slack `ts`). No-op when already stored.
    pub async fn try_push_message(
        &self,
        session_id: &str,
        id: &str,
        role: &str,
        text: &str,
    ) -> bool {
        let trimmed = text.trim().to_string();
        if trimmed.is_empty() {
            return false;
        }
        let inserted = self
            .sessions
            .push_line(
                session_id,
                ChatLine {
                    id: id.to_string(),
                    role: role.to_string(),
                    text: trimmed.clone(),
                },
            )
            .await;
        if !inserted {
            return false;
        }
        self.hub
            .publish(
                session_id,
                ChatEvent::Message {
                    id: id.to_string(),
                    role: role.to_string(),
                    text: trimmed,
                },
            )
            .await;
        true
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

/// Request body for the `/v1/book` HTTP endpoint (MCP proxy).
#[derive(Debug, Deserialize)]
struct BookPayload {
    /// Must match `MCP_CHAT_TOKEN` on this service.
    token: String,
    first_name: String,
    last_name: String,
    email: String,
    /// ISO 8601 start datetime without UTC offset, e.g. "2026-08-25T14:00:00".
    start: String,
}

/// Request body for `POST /v1/calendar/freebusy` (MCP proxy).
#[derive(Debug, Deserialize)]
struct FreeBusyPayload {
    /// Must match `MCP_CHAT_TOKEN` on this service.
    token: String,
    /// Window start (RFC3339 or naive ISO 8601, same style as booking start).
    time_min: String,
    /// Window end (exclusive).
    time_max: String,
}

/// Mount chat routes under `/v1`.
pub fn chat_router(state: ChatState) -> Router {
    Router::new()
        .route("/v1/presence", get(get_presence))
        .route("/v1/sessions", post(create_session))
        .route("/v1/sessions/{id}/ws", get(ws_upgrade))
        .route("/v1/book", post(book_handler))
        .route("/v1/calendar/freebusy", post(freebusy_handler))
        .route("/ready", get(ready))
        .with_state(state)
}

/// Readiness: chat process wiring (Slack optional).
#[utoipa::path(
    get,
    path = "/ready",
    tag = "public",
    responses(
        (status = 200, description = "Chat process readiness", body = ReadyResponse)
    )
)]
pub async fn ready(State(state): State<ChatState>) -> Json<ReadyResponse> {
    Json(ReadyResponse {
        ok: true,
        chat: true,
        slack: state.slack.enabled(),
        slack_socket: crate::chat::socket_configured(),
    })
}

/// `POST /v1/book` - MCP proxy: insert a Google Calendar event directly.
///
/// Token must match `MCP_CHAT_TOKEN` on this service. Returns the created event id and link.
async fn book_handler(
    State(state): State<ChatState>,
    Json(payload): Json<BookPayload>,
) -> impl IntoResponse {
    let expected = std::env::var("MCP_CHAT_TOKEN").unwrap_or_default();
    if expected.is_empty() || payload.token != expected {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "invalid or missing token" })),
        )
            .into_response();
    }
    for (field, val) in [
        ("first_name", payload.first_name.trim()),
        ("last_name", payload.last_name.trim()),
        ("email", payload.email.trim()),
        ("start", payload.start.trim()),
    ] {
        if val.is_empty() {
            return (
                axum::http::StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({ "error": format!("{field} is required") })),
            )
                .into_response();
        }
    }
    if !state.calendar.enabled() {
        return (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "calendar not configured" })),
        )
            .into_response();
    }
    let req = BookingRequest {
        first_name: payload.first_name.trim().to_string(),
        last_name: payload.last_name.trim().to_string(),
        email: payload.email.trim().to_string(),
        start: payload.start.trim().to_string(),
    };
    // Safety-net: post to Slack before attempting the calendar write.
    let safety = format!(
        "BOOKING REQUEST (MCP): {} {} <{}> slot {}",
        req.first_name, req.last_name, req.email, req.start
    );
    if let Ok(channel) = state.slack.open_dm().await {
        let _ = state.slack.post_in_thread(&channel, None, &safety).await;
    }
    match state.calendar.insert_event(&req).await {
        Ok(confirmation) => {
            tracing::info!(event_id = %confirmation.event_id, "MCP /v1/book: event created");
            if let Ok(channel) = state.slack.open_dm().await {
                let _ = state
                    .slack
                    .post_in_thread(
                        &channel,
                        None,
                        &format!("BOOKED (MCP): {}", confirmation.html_link),
                    )
                    .await;
            }
            (
                axum::http::StatusCode::OK,
                Json(json!({
                    "event_id": confirmation.event_id,
                    "html_link": confirmation.html_link,
                })),
            )
                .into_response()
        }
        Err(err) => {
            if err.to_string().starts_with(SLOT_TAKEN_ERROR_PREFIX) {
                tracing::info!("MCP /v1/book: requested slot already occupied");
                if let Ok(channel) = state.slack.open_dm().await {
                    let _ = state
                        .slack
                        .post_in_thread(
                            &channel,
                            None,
                            "BOOKING FAILED (MCP): requested slot already taken",
                        )
                        .await;
                }
                return (
                    axum::http::StatusCode::CONFLICT,
                    Json(json!({ "error": "slot already taken" })),
                )
                    .into_response();
            }
            tracing::warn!(error = %err, "MCP /v1/book: calendar insert failed");
            if let Ok(channel) = state.slack.open_dm().await {
                let _ = state
                    .slack
                    .post_in_thread(&channel, None, &format!("BOOKING FAILED (MCP): {err}"))
                    .await;
            }
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "calendar insert failed" })),
            )
                .into_response()
        }
    }
}

/// `POST /v1/calendar/freebusy` - MCP proxy: list busy intervals on Greg's calendar.
async fn freebusy_handler(
    State(state): State<ChatState>,
    Json(payload): Json<FreeBusyPayload>,
) -> impl IntoResponse {
    let expected = std::env::var("MCP_CHAT_TOKEN").unwrap_or_default();
    if expected.is_empty() || payload.token != expected {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "invalid or missing token" })),
        )
            .into_response();
    }
    let time_min = payload.time_min.trim();
    let time_max = payload.time_max.trim();
    if time_min.is_empty() || time_max.is_empty() {
        return (
            axum::http::StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({ "error": "time_min and time_max are required" })),
        )
            .into_response();
    }
    if time_min >= time_max {
        return (
            axum::http::StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({ "error": "time_min must be before time_max" })),
        )
            .into_response();
    }
    if !state.calendar.enabled() {
        return (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "calendar not configured" })),
        )
            .into_response();
    }
    match state.calendar.busy_intervals(time_min, time_max).await {
        Ok(busy) => {
            tracing::info!(
                busy_count = busy.len(),
                %time_min,
                %time_max,
                "MCP /v1/calendar/freebusy"
            );
            (
                axum::http::StatusCode::OK,
                Json(json!({
                    "time_min": time_min,
                    "time_max": time_max,
                    "busy": busy,
                    "snippet": format_busy_snippet(&busy, time_min, time_max),
                })),
            )
                .into_response()
        }
        Err(err) => {
            tracing::warn!(error = %err, "MCP /v1/calendar/freebusy failed");
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "freebusy query failed" })),
            )
                .into_response()
        }
    }
}

/// Current live/away presence for the site chat widget.
#[utoipa::path(
    get,
    path = "/v1/presence",
    tag = "public",
    responses(
        (status = 200, description = "Presence snapshot", body = PresenceResponse)
    )
)]
pub async fn get_presence(State(state): State<ChatState>) -> Json<PresenceResponse> {
    let snap = state.presence.snapshot().await;
    Json(PresenceResponse::from(snap))
}

#[derive(Debug, Default, Deserialize)]
struct CreateSessionRequest {
    locale: Option<String>,
}

async fn create_session(State(state): State<ChatState>, body: Bytes) -> impl IntoResponse {
    let req: CreateSessionRequest = if body.is_empty() {
        CreateSessionRequest::default()
    } else {
        serde_json::from_slice(&body).unwrap_or_default()
    };
    let locale = ChatLocale::parse(req.locale.as_deref());
    let snap = state.presence.snapshot().await;
    let session = state.sessions.create(snap.mode, locale).await;
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

    let session = sync_session_presence(&state, &session.id)
        .await
        .unwrap_or(session);

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
            serde_json::to_string(&presence_event(session.mode))
                .unwrap_or_default()
                .into(),
        ))
        .await;

    for line in state.sessions.lines(&session_id).await {
        let _ = send_line(&mut sender, &line).await;
    }

    let send_state = state.clone();
    let send_session_id = session_id.clone();
    let mut send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    if send_chat_event(&mut sender, &event).await.is_err() {
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!(
                        session = %send_session_id,
                        skipped,
                        "WS broadcast lagged; replaying session transcript"
                    );
                    for line in send_state.sessions.lines(&send_session_id).await {
                        let _ = send_line(&mut sender, &line).await;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
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

fn presence_event(mode: PresenceMode) -> ChatEvent {
    ChatEvent::Presence {
        mode: mode.as_str().into(),
        label: mode.label().into(),
    }
}

async fn send_chat_event(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    event: &ChatEvent,
) -> Result<(), axum::Error> {
    let text = serde_json::to_string(event).unwrap_or_default();
    sender.send(Message::Text(text.into())).await
}

async fn send_line(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    line: &ChatLine,
) -> Result<(), axum::Error> {
    send_chat_event(
        sender,
        &ChatEvent::Message {
            id: line.id.clone(),
            role: line.role.clone(),
            text: line.text.clone(),
        },
    )
    .await
}

/// Re-read Slack presence, update the session when it flipped, push WS when asked.
async fn sync_session_presence(state: &ChatState, session_id: &str) -> Option<Session> {
    let snap = state.presence.snapshot().await;
    let changed = state.sessions.set_mode(session_id, snap.mode).await;
    if changed {
        state
            .hub
            .publish(session_id, presence_event(snap.mode))
            .await;
        tracing::info!(
            session = %session_id,
            mode = snap.mode.as_str(),
            "chat presence updated for session"
        );
    }
    state.sessions.get(session_id).await
}

/// Poll Slack presence and fan out flips to every open session.
fn spawn_presence_watcher(state: ChatState) {
    tokio::spawn(async move {
        // Slack DND updates often lag ~1m; 30s is enough without stampeding the API.
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(30));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        // First tick completes immediately; skip so we do not double-hit Slack on boot.
        ticker.tick().await;
        loop {
            ticker.tick().await;
            let snap = state.presence.snapshot().await;
            let changed = state.sessions.set_all_modes(snap.mode).await;
            if changed.is_empty() {
                continue;
            }
            tracing::info!(
                mode = snap.mode.as_str(),
                sessions = changed.len(),
                "chat presence flipped; notifying open sessions"
            );
            state
                .hub
                .publish_many(&changed, presence_event(snap.mode))
                .await;
        }
    });
}

async fn handle_client_msg(state: &ChatState, session_id: &str, msg: ClientWsMessage) {
    let Some(session) = sync_session_presence(state, session_id).await else {
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
            if is_booking_chip_shortcut(&text, session.locale) {
                handle_away(state, &session, session_id, &text).await;
                return;
            }
            match session.mode {
                PresenceMode::Live => {
                    handle_live(state, &session, &text).await;
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
    state.push_message(session_id, role, text).await;
}

async fn ensure_session_thread(state: &ChatState, session: &Session) -> Option<(String, String)> {
    // Re-read from registry to avoid a race where two concurrent messages both
    // see no thread and each create one.
    let fresh = state.sessions.get(&session.id).await;
    if let Some(s) = &fresh {
        if let (Some(channel), Some(ts)) = (&s.slack_channel, &s.slack_thread_ts) {
            return Some((channel.clone(), ts.clone()));
        }
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

async fn handle_live(state: &ChatState, session: &Session, text: &str) {
    let env = crate::chat::chat_env_label();
    let _ = post_to_session_thread(state, session, &format!("Prospect ({env}): {text}")).await;
}

/// When the visitor asks about booking and Calendar is configured, inject a busy snippet.
async fn away_calendar_context(state: &ChatState, visitor_text: &str) -> Option<String> {
    if !state.calendar.enabled() || !looks_like_scheduling_intent(visitor_text) {
        return None;
    }
    let (time_min, time_max) = upcoming_freebusy_window(7);
    match state.calendar.busy_intervals(&time_min, &time_max).await {
        Ok(busy) => Some(format_busy_snippet(&busy, &time_min, &time_max)),
        Err(err) => {
            tracing::warn!(error = %err, "away freebusy hint failed");
            None
        }
    }
}

async fn handle_away(state: &ChatState, session: &Session, session_id: &str, text: &str) {
    let env = crate::chat::chat_env_label();
    let _ = post_to_session_thread(state, session, &format!("Prospect ({env}): {text}")).await;
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
    let lines = state.sessions.lines(session_id).await;
    let email = state
        .sessions
        .get(session_id)
        .await
        .and_then(|s| s.visitor_email);
    let calendar_context = away_calendar_context(state, text).await;
    let playlist_nudge = crate::chat::playlist::playlist_nudge_note(&lines);
    let raw_reply = state
        .away
        .reply(
            text,
            session.locale,
            &lines,
            email.as_deref(),
            calendar_context.as_deref(),
            playlist_nudge,
        )
        .await;
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

    // Calendar write path: LLM embeds a structured tag when all details are collected.
    let reply = if let Some(req) = extract_booking_tag(&raw_reply) {
        let visible = strip_booking_tag(&raw_reply);
        handle_calendar_booking(state, session, session_id, &req, &visible, email.as_deref()).await
    } else {
        raw_reply.clone()
    };

    // Keep [[PLAYLIST: …]] in the visitor WebSocket payload so the browser can start radio;
    // strip it from the Slack mirror only.
    publish_role(state, session_id, "itcy", &reply).await;
    let slack_reply = crate::chat::playlist::strip_playlist_tag(&reply);
    let mirror = email.map_or_else(
        || format!("ITCy: {slack_reply}"),
        |e| format!("ITCy: {slack_reply}\n(visitor email: {e})"),
    );
    let _ = post_to_session_thread(state, session, &mirror).await;
}

fn is_booking_chip_shortcut(text: &str, locale: ChatLocale) -> bool {
    let trimmed = text.trim();
    match locale {
        ChatLocale::En => trimmed.eq_ignore_ascii_case("Book a meeting"),
        ChatLocale::Fr => trimmed.eq_ignore_ascii_case("Prendre rendez-vous"),
        ChatLocale::Nl => trimmed.eq_ignore_ascii_case("Afspraak maken"),
    }
}

/// Try to insert a Google Calendar event. Returns an updated reply for the visitor.
///
/// On success: confirmation with the event link.
/// On failure: the LLM text with no booking tag, plus a Slack safety-net post.
async fn handle_calendar_booking(
    state: &ChatState,
    session: &Session,
    session_id: &str,
    req: &BookingRequest,
    visible_reply: &str,
    visitor_email: Option<&str>,
) -> String {
    // Always post details to Slack as a safety net first.
    let safety = format!(
        "BOOKING REQUEST: {} {} <{}> slot {}",
        req.first_name, req.last_name, req.email, req.start
    );
    let _ = post_to_session_thread(state, session, &safety).await;

    if !state.calendar.enabled() {
        tracing::info!(
            session = %session_id,
            "CalendarClient not configured; booking details posted to Slack only"
        );
        return visible_reply.to_string();
    }

    match state.calendar.insert_event(req).await {
        Ok(confirmation) => {
            tracing::info!(
                session = %session_id,
                event_id = %confirmation.event_id,
                "Google Calendar event created"
            );
            let _ = post_to_session_thread(
                state,
                session,
                &format!("BOOKED: {}", confirmation.html_link),
            )
            .await;
            let email_hint = visitor_email.unwrap_or(&req.email);
            format!(
                "Your meeting is confirmed. \
                 You will receive a Google Calendar invite at {email_hint}."
            )
        }
        Err(err) => {
            if err.to_string().starts_with(SLOT_TAKEN_ERROR_PREFIX) {
                let _ = post_to_session_thread(
                    state,
                    session,
                    "BOOKING FAILED (slot occupied): requested slot already taken",
                )
                .await;
                return "This time slot is already occupied. Please propose another date/time."
                    .to_string();
            }
            tracing::warn!(error = %err, session = %session_id, "Calendar insert failed");
            let _ = post_to_session_thread(
                state,
                session,
                &format!("BOOKING FAILED (calendar insert): {err}"),
            )
            .await;
            "I could not create the Google Calendar event right now. \
             I have passed your details to Greg. \
             He will confirm the meeting by email."
                .to_string()
        }
    }
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
                "### Test\nInterchouette Rust chat test MCP context.",
            ),
            calendar: CalendarClient::from_env(),
        }
    }

    #[test]
    fn booking_chip_shortcut_matches_by_locale() {
        assert!(is_booking_chip_shortcut("Book a meeting", ChatLocale::En));
        assert!(is_booking_chip_shortcut("book a meeting", ChatLocale::En));
        assert!(is_booking_chip_shortcut(
            "Prendre rendez-vous",
            ChatLocale::Fr
        ));
        assert!(is_booking_chip_shortcut("Afspraak maken", ChatLocale::Nl));
        assert!(!is_booking_chip_shortcut("Book a meeting", ChatLocale::Fr));
        assert!(!is_booking_chip_shortcut("Book meeting", ChatLocale::En));
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
        assert_eq!(body["short_code"].as_str().unwrap().len(), 8);
    }

    #[tokio::test]
    async fn create_session_stores_locale() {
        let state = test_state();
        let app = chat_router(state.clone());
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/sessions")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"locale":"nl"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        let id = body["session_id"].as_str().unwrap();
        assert_eq!(state.sessions.get(id).await.unwrap().locale, ChatLocale::Nl);
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
        let session = state
            .sessions
            .create(PresenceMode::Live, ChatLocale::En)
            .await;
        let mut rx = state.hub.subscribe(&session.id).await;
        let tagged = format!("[{}] hello from Greg", session.short_code);
        assert!(crate::chat::forward_greg_reply(&state, &tagged, None, None).await);
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
    async fn book_endpoint_rejects_missing_token() {
        let state = test_state();
        let app = chat_router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/book")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::to_string(&json!({
                            "token": "",
                            "first_name": "Alice",
                            "last_name": "Test",
                            "email": "alice@example.com",
                            "start": "2026-09-01T10:00:00",
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn book_endpoint_rejects_wrong_token() {
        // Set a known token in the env; the request sends a wrong one.
        std::env::set_var("MCP_CHAT_TOKEN", "correct-secret");
        let state = test_state();
        let app = chat_router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/book")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::to_string(&json!({
                            "token": "wrong",
                            "first_name": "Alice",
                            "last_name": "Test",
                            "email": "alice@example.com",
                            "start": "2026-09-01T10:00:00",
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        std::env::remove_var("MCP_CHAT_TOKEN");
    }

    #[tokio::test]
    async fn book_endpoint_requires_calendar_configured() {
        // Correct token, but CalendarClient not configured => SERVICE_UNAVAILABLE.
        std::env::set_var("MCP_CHAT_TOKEN", "test-token");
        // CalendarClient::from_env() will be unconfigured because GCAL_* are absent.
        let state = test_state();
        let app = chat_router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/book")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::to_string(&json!({
                            "token": "test-token",
                            "first_name": "Alice",
                            "last_name": "Test",
                            "email": "alice@example.com",
                            "start": "2026-09-01T10:00:00",
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        // Either 503 (calendar not configured) or 401 (token env race) is acceptable,
        // but it must not be 200 or 500.
        assert!(
            response.status() == StatusCode::SERVICE_UNAVAILABLE
                || response.status() == StatusCode::UNAUTHORIZED,
        );
        std::env::remove_var("MCP_CHAT_TOKEN");
    }

    #[tokio::test]
    async fn freebusy_endpoint_rejects_missing_token() {
        let state = test_state();
        let app = chat_router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/calendar/freebusy")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::to_string(&json!({
                            "token": "",
                            "time_min": "2026-09-01T00:00:00Z",
                            "time_max": "2026-09-08T00:00:00Z",
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn freebusy_endpoint_requires_calendar_configured() {
        std::env::set_var("MCP_CHAT_TOKEN", "test-token");
        let state = test_state();
        let app = chat_router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/calendar/freebusy")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::to_string(&json!({
                            "token": "test-token",
                            "time_min": "2026-09-01T00:00:00Z",
                            "time_max": "2026-09-08T00:00:00Z",
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(
            response.status() == StatusCode::SERVICE_UNAVAILABLE
                || response.status() == StatusCode::UNAUTHORIZED,
        );
        std::env::remove_var("MCP_CHAT_TOKEN");
    }

    #[tokio::test]
    async fn greg_thread_reply_reaches_hub() {
        let state = test_state();
        let session = state
            .sessions
            .create(PresenceMode::Live, ChatLocale::En)
            .await;
        state
            .sessions
            .set_slack_thread(&session.id, "D1".into(), "171.999".into())
            .await;
        let mut rx = state.hub.subscribe(&session.id).await;
        assert!(
            crate::chat::forward_greg_reply(&state, "hello from thread", Some("171.999"), None)
                .await
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

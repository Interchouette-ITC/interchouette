//! Chat HTTP listener (`/v1/sessions`, `/health`).

use anyhow::Result;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};

use crate::chat::{chat_router, AwayBrain, ChatState};

/// Default bind address.
pub const DEFAULT_HTTP_LISTEN: &str = "0.0.0.0:8080";

/// Build the chat HTTP router.
pub fn build_app(cors_origin: &str) -> Router {
    build_app_parts(cors_origin).0
}

/// Build router + chat state (caller may spawn Slack inbound).
pub fn build_app_parts(cors_origin: &str) -> (Router, ChatState) {
    let cors = build_cors(cors_origin);
    let chat = ChatState::new(AwayBrain::from_env());
    let app = Router::new()
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .merge(chat_router(chat.clone()))
        .layer(cors);
    (app, chat)
}

fn build_cors(cors_origin: &str) -> CorsLayer {
    use axum::http::{HeaderValue, Method};
    let mut origins = vec![
        HeaderValue::from_static("https://interchouette.net"),
        HeaderValue::from_static("http://127.0.0.1:4200"),
        HeaderValue::from_static("http://localhost:4200"),
    ];
    if let Ok(extra) = cors_origin.parse::<HeaderValue>() {
        if !origins.contains(&extra) {
            origins.push(extra);
        }
    }
    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any)
}

/// Run chat HTTP on `addr`.
///
/// # Errors
/// Returns when bind or serve fails.
pub async fn run_http(addr: &str, cors_origin: String) -> Result<()> {
    let (app, chat) = build_app_parts(&cors_origin);
    chat.spawn_background_tasks();
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "interchouette-chat listening");
    axum::serve(listener, app).await?;
    Ok(())
}

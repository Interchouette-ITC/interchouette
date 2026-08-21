//! Public `OpenAPI` document for safe, read-oriented chat HTTP routes.
//!
//! Session, WebSocket, and book endpoints stay implemented but undocumented.

use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use utoipa::OpenApi;

use crate::chat::PresenceMode;
use crate::chat::PresenceSnapshot;
use crate::news::types::{NewsFeed, NewsFeeds, NewsItem, NewsResponse};

/// Public `OpenAPI` 3 document (subset of the Interchouette API host).
#[derive(OpenApi)]
#[openapi(
    info(
        title = "Interchouette API (public)",
        version = "0.1.0",
        description = "Public read-oriented HTTP surface for Interchouette API (chat, news, health). \
Session creation, WebSocket chat, and booking proxies are private and omitted here. \
For profile search and related agent tools, use remote MCP at https://mcp.interchouette.net/ \
(see https://interchouette.net/.well-known/mcp.json and https://interchouette.net/llms.txt)."
    ),
    servers((url = "https://api.interchouette.net")),
    paths(
        health,
        crate::chat::api::ready,
        crate::chat::api::get_presence,
        crate::news::api::news_handler,
        crate::news::api::news_rss_handler,
        crate::news::api::news_atom_handler
    ),
    components(schemas(
        HealthResponse,
        ReadyResponse,
        PresenceMode,
        PresenceResponse,
        NewsItem,
        NewsFeed,
        NewsFeeds,
        NewsResponse
    ))
)]
pub struct PublicApi;

/// `GET /health` body.
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct HealthResponse {
    pub ok: bool,
}

/// Liveness probe.
#[utoipa::path(
    get,
    path = "/health",
    tag = "public",
    responses(
        (status = 200, description = "Process is up", body = HealthResponse)
    )
)]
pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { ok: true })
}

/// `GET /ready` body (matches the long-standing JSON field set).
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct ReadyResponse {
    pub ok: bool,
    pub chat: bool,
    pub slack: bool,
    pub slack_socket: bool,
}

/// `GET /v1/presence` body (same fields as the widget snapshot).
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct PresenceResponse {
    pub mode: PresenceMode,
    pub label: String,
    pub hero: String,
}

impl From<PresenceSnapshot> for PresenceResponse {
    fn from(snap: PresenceSnapshot) -> Self {
        Self {
            mode: snap.mode,
            label: snap.label.to_owned(),
            hero: snap.hero.to_owned(),
        }
    }
}

/// Mount `GET /openapi.json`.
pub fn openapi_router() -> Router {
    Router::new().route(
        "/openapi.json",
        get(|| async { Json(PublicApi::openapi()) }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use serde_json::Value;
    use tower::ServiceExt;

    #[tokio::test]
    async fn openapi_lists_public_paths_only() {
        let app = openapi_router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/openapi.json")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let doc: Value = serde_json::from_slice(&bytes).unwrap();
        let paths = doc.get("paths").and_then(|p| p.as_object()).unwrap();
        assert!(paths.contains_key("/health"));
        assert!(paths.contains_key("/ready"));
        assert!(paths.contains_key("/v1/presence"));
        assert!(paths.contains_key("/v1/news"));
        assert!(paths.contains_key("/v1/news/rss.xml"));
        assert!(paths.contains_key("/v1/news/atom.xml"));
        assert!(!paths.contains_key("/v1/sessions"));
        assert!(!paths.contains_key("/v1/book"));
        assert!(!paths.keys().any(|k| k.contains("/ws")));
    }
}

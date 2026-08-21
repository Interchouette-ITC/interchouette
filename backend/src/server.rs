//! Chat HTTP listener (`/v1/sessions`, `/health`, `/openapi.json`).

use anyhow::Result;
use axum::routing::get;
use axum::Router;
use tower_http::cors::{Any, CorsLayer};

use crate::chat::{chat_router, AwayBrain, ChatState};
use crate::news::NewsState;
use crate::openapi::{health, openapi_router};

/// Default bind address.
pub const DEFAULT_HTTP_LISTEN: &str = "0.0.0.0:8080";

/// Build the chat HTTP router.
pub async fn build_app(cors_origin: &str) -> Router {
    build_app_parts(cors_origin).await.0
}

/// Build router + chat state (caller may spawn Slack inbound).
pub async fn build_app_parts(cors_origin: &str) -> (Router, ChatState) {
    let cors = build_cors(cors_origin);
    let chat = ChatState::new(AwayBrain::from_env());
    let news = NewsState::from_env().await;
    news.clone().spawn_cache_warmup();
    let app = Router::new()
        .route("/health", get(health))
        .merge(openapi_router())
        .merge(chat_router(chat.clone()))
        .merge(news.router())
        .layer(cors);
    (app, chat)
}

fn build_cors(cors_origin: &str) -> CorsLayer {
    use axum::http::{HeaderValue, Method};
    let mut origins = vec![
        HeaderValue::from_static("https://interchouette.net"),
        HeaderValue::from_static("https://www.interchouette.net"),
        HeaderValue::from_static("https://interchouette.nl"),
        HeaderValue::from_static("https://www.interchouette.nl"),
        HeaderValue::from_static("https://interchouette.fr"),
        HeaderValue::from_static("https://www.interchouette.fr"),
        HeaderValue::from_static("http://127.0.0.1:4200"),
        HeaderValue::from_static("http://localhost:4200"),
        HeaderValue::from_static("http://127.0.0.1:4201"),
        HeaderValue::from_static("http://localhost:4201"),
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
    let (app, chat) = build_app_parts(&cors_origin).await;
    chat.spawn_background_tasks();
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "interchouette-chat listening");
    axum::serve(listener, app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    #[tokio::test]
    async fn cors_allows_locale_tld_origins() {
        use axum::routing::get;

        let app = Router::new()
            .route("/health", get(|| async { "ok" }))
            .layer(build_cors("https://interchouette.net"));
        for origin in [
            "https://interchouette.fr",
            "https://www.interchouette.nl",
            "https://www.interchouette.net",
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method("OPTIONS")
                        .uri("/health")
                        .header("origin", origin)
                        .header("access-control-request-method", "POST")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let allow = response
                .headers()
                .get("access-control-allow-origin")
                .unwrap_or_else(|| panic!("missing ACAO for {origin}"))
                .to_str()
                .unwrap();
            assert_eq!(allow, origin);
        }
    }
}

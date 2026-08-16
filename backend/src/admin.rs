//! Admin HTTP: rebuild FTS from the committed markdown tree shipped in the image.

use std::sync::Arc;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};

use crate::db::Store;
use crate::ingest;

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<Store>,
    pub admin_token: Option<String>,
    pub knowledge_dir: std::path::PathBuf,
}

type AuthError = (StatusCode, Json<Value>);

/// Rebuild the derived FTS index from `KNOWLEDGE_DIR` (image / git corpus).
///
/// Content updates are done by editing `knowledge/**/*.md` in git and shipping
/// a new image. This endpoint only re-reads that tree (ops / without restart).
pub async fn reingest_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(resp) = authorize(&state, &headers) {
        return resp.into_response();
    }
    match ingest::ingest_dir(&state.store, &state.knowledge_dir) {
        Ok(n) => (StatusCode::OK, Json(json!({ "ingested": n }))).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": err.to_string() })),
        )
            .into_response(),
    }
}

fn authorize(state: &AppState, headers: &HeaderMap) -> Result<(), AuthError> {
    let Some(expected) = state.admin_token.as_ref() else {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "ADMIN_TOKEN not configured" })),
        ));
    };
    let Some(auth) = headers.get(axum::http::header::AUTHORIZATION) else {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "missing Authorization" })),
        ));
    };
    let Ok(auth) = auth.to_str() else {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "invalid Authorization" })),
        ));
    };
    let token = auth.strip_prefix("Bearer ").unwrap_or(auth);
    if token != expected {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "unauthorized" })),
        ));
    }
    Ok(())
}

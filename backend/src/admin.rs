//! Admin HTTP handlers for knowledge upload.

use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::db::{KnowledgeDoc, Store};
use crate::ingest;

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<Store>,
    pub admin_token: Option<String>,
    pub knowledge_dir: std::path::PathBuf,
}

#[derive(Debug, Deserialize)]
pub struct UpsertQuery {
    pub slug: String,
    pub lang: Option<String>,
    pub title: Option<String>,
}

type AuthError = (StatusCode, Json<Value>);

/// Re-ingest bundled markdown from `KNOWLEDGE_DIR`.
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

/// Upsert one markdown document (raw body).
pub async fn upsert_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<UpsertQuery>,
    body: Bytes,
) -> impl IntoResponse {
    if let Err(resp) = authorize(&state, &headers) {
        return resp.into_response();
    }
    let text = String::from_utf8_lossy(&body).into_owned();
    if text.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "empty body" })),
        )
            .into_response();
    }
    let lang = q.lang.unwrap_or_else(|| "en".into());
    let title = q.title.unwrap_or_else(|| q.slug.clone());
    let doc = KnowledgeDoc {
        slug: q.slug,
        lang,
        title,
        body: text,
    };
    match state.store.upsert_doc(&doc) {
        Ok(()) => (
            StatusCode::OK,
            Json(json!({ "ok": true, "slug": doc.slug })),
        )
            .into_response(),
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

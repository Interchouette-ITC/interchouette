//! MCP tools + HTTP listener (`/interchouette`, `/health`).

#![allow(unknown_lints)]
#![allow(clippy::unused_async)]
#![allow(clippy::unused_async_trait_impl)]

use std::fmt::Write as _;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;
use axum::routing::get;
use axum::{Json, Router};
use rmcp::{
    handler::server::wrapper::Parameters,
    model::{CallToolResult, ContentBlock, Implementation, ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router, ErrorData as McpError, ServerHandler,
};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};

use crate::chat::{chat_router, AwayBrain, ChatState};
use crate::db::Store;

/// Default bind address (Render sets `PORT`).
pub const DEFAULT_HTTP_LISTEN: &str = "0.0.0.0:8080";

/// Hosts allowed by the Streamable HTTP transport by default.
pub const DEFAULT_ALLOWED_HOSTS: &[&str] = &[
    "localhost",
    "127.0.0.1",
    "::1",
    "mcp.interchouette.net",
    "interchouette-mcp-latest.onrender.com",
];

/// Shared MCP server state.
#[derive(Clone)]
pub struct KnowledgeMcp {
    store: Arc<Store>,
}

impl KnowledgeMcp {
    /// Build an MCP handler over an opened store.
    #[must_use]
    pub const fn new(store: Arc<Store>) -> Self {
        Self { store }
    }
}

fn text_ok(text: impl Into<String>) -> CallToolResult {
    CallToolResult::success(vec![ContentBlock::text(text.into())])
}

fn mcp_err(msg: impl Into<String>) -> McpError {
    McpError::invalid_params(msg.into(), None)
}

#[derive(Debug, Deserialize, JsonSchema)]
struct SearchArgs {
    /// Full-text query (e.g. "Gregory Roussac", "Rust MCP", "Interchouette").
    query: String,
    /// Optional language filter: `en` or `nl`.
    lang: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct LangArgs {
    /// Optional language: `en` or `nl` (default en for overviews that exist in both).
    lang: Option<String>,
}

#[tool_router]
impl KnowledgeMcp {
    #[tool(
        description = "Full-text search over Interchouette / Gregory Roussac knowledge (Rust, Wasm, MCP, API, CV, projects). Prefer full name Gregory Roussac."
    )]
    async fn search_knowledge(
        &self,
        Parameters(SearchArgs { query, lang }): Parameters<SearchArgs>,
    ) -> Result<CallToolResult, McpError> {
        let lang_ref = lang.as_deref();
        match self.store.search(&query, lang_ref, 8) {
            Ok(hits) if hits.is_empty() => Ok(text_ok("No matches.")),
            Ok(hits) => {
                let mut out = String::new();
                for hit in hits {
                    let _ = write!(
                        out,
                        "## {} ({}/{})\n{}\n\n",
                        hit.title, hit.lang, hit.slug, hit.snippet
                    );
                }
                Ok(text_ok(out))
            }
            Err(err) => Err(mcp_err(err.to_string())),
        }
    }

    #[tool(description = "Interchouette ITC company overview (lang: en or nl).")]
    async fn get_interchouette_overview(
        &self,
        Parameters(LangArgs { lang }): Parameters<LangArgs>,
    ) -> Result<CallToolResult, McpError> {
        let lang = lang.unwrap_or_else(|| "en".into());
        let slug = format!("{lang}/interchouette-overview");
        doc_or_err(&self.store, &slug, Some(lang.as_str()))
    }

    #[tool(description = "Profile of Gregory Roussac (founder of Interchouette ITC).")]
    async fn get_gregory_profile(&self) -> Result<CallToolResult, McpError> {
        doc_or_err(&self.store, "en/gregory-roussac", Some("en"))
    }

    #[tool(description = "CV summary for Gregory Roussac with links to HTML/PDF CV.")]
    async fn get_cv_summary(&self) -> Result<CallToolResult, McpError> {
        doc_or_err(&self.store, "en/cv-summary", Some("en"))
    }

    #[tool(
        description = "Public Interchouette / Gregory Roussac project and image catalog blurbs."
    )]
    async fn list_public_projects(&self) -> Result<CallToolResult, McpError> {
        doc_or_err(&self.store, "en/public-projects", Some("en"))
    }

    #[tool(description = "Public contact channels for Gregory Roussac / Interchouette.")]
    async fn get_contact(&self) -> Result<CallToolResult, McpError> {
        Ok(text_ok(
            "Email: contact@interchouette.net\n\
             Personal: gregory@interchouette.net\n\
             Site: https://interchouette.net/\n\
             CV: https://interchouette.net/CV\n\
             GitHub org: https://github.com/Interchouette-ITC\n\
             LinkedIn: https://www.linkedin.com/in/gregoryroussac/\n\
             Signal: https://signal.me/#u/interchouette.42 (username interchouette.42)\n\
             Twitter: https://twitter.com/interchouette",
        ))
    }
}

fn doc_or_err(store: &Store, slug: &str, lang: Option<&str>) -> Result<CallToolResult, McpError> {
    match store.get_by_slug(slug, lang) {
        Ok(Some(doc)) => Ok(text_ok(format!("# {}\n\n{}", doc.title, doc.body))),
        Ok(None) => Err(mcp_err(format!("document not found: {slug}"))),
        Err(err) => Err(mcp_err(err.to_string())),
    }
}

#[tool_handler]
impl ServerHandler for KnowledgeMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new(
                "interchouette-knowledge",
                env!("CARGO_PKG_VERSION"),
            ))
            .with_instructions(
                "Knowledge MCP for Gregory Roussac and Interchouette ITC. \
                 Search with full name Gregory Roussac, Interchouette, Rust MCP, Rust API, Wasm. \
                 Official URL: https://mcp.interchouette.net/interchouette",
            )
    }
}

/// Build the HTTP router (health + Streamable HTTP MCP + chat).
///
/// # Errors
/// Returns when the knowledge DB cannot be opened.
pub fn build_app(
    knowledge_db: &std::path::Path,
    data_dir: &std::path::Path,
    cors_origin: &str,
    allowed_hosts: Vec<String>,
) -> Result<Router> {
    Ok(build_app_parts(knowledge_db, data_dir, cors_origin, allowed_hosts)?.0)
}

/// Build router + chat state (caller may spawn Slack inbound).
///
/// # Errors
/// Returns when the knowledge DB cannot be opened.
pub fn build_app_parts(
    knowledge_db: &std::path::Path,
    data_dir: &std::path::Path,
    cors_origin: &str,
    allowed_hosts: Vec<String>,
) -> Result<(Router, ChatState)> {
    let store = Arc::new(Store::open_readonly(knowledge_db, data_dir)?);
    let n = store.doc_count()?;
    tracing::info!(documents = n, db = %knowledge_db.display(), "interchouette.db ready (read-only)");
    let _ = store.bot_schema_version()?;

    let mcp = KnowledgeMcp::new(Arc::clone(&store));
    let mut config =
        rmcp::transport::streamable_http_server::tower::StreamableHttpServerConfig::default();
    config = config.with_allowed_hosts(allowed_hosts);
    let mcp_service = rmcp::transport::streamable_http_server::tower::StreamableHttpService::new(
        move || Ok(mcp.clone()),
        Arc::new(
            rmcp::transport::streamable_http_server::session::local::LocalSessionManager::default(),
        ),
        config,
    );
    let mcp_router = axum::routing::any_service(mcp_service);

    let cors = build_cors(cors_origin);
    let chat = ChatState::new(AwayBrain::from_env());

    let app = Router::new()
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .route("/interchouette", mcp_router.clone())
        .route("/interchouette/", mcp_router)
        .merge(chat_router(chat.clone()))
        .layer(cors);
    Ok((app, chat))
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

/// Run Streamable HTTP MCP + health on `addr`.
///
/// # Errors
/// Returns when bind or serve fails.
pub async fn run_http(
    addr: &str,
    knowledge_db: PathBuf,
    data_dir: PathBuf,
    cors_origin: String,
    allowed_hosts: Vec<String>,
) -> Result<()> {
    let (app, chat) = build_app_parts(&knowledge_db, &data_dir, &cors_origin, allowed_hosts)?;
    chat.spawn_background_tasks();
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "interchouette-mcp listening");
    axum::serve(listener, app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tempfile::tempdir;
    use tower::ServiceExt;

    use crate::db::KnowledgeDoc;

    fn seed_store(dir: &tempfile::TempDir) -> (PathBuf, PathBuf) {
        let db = dir.path().join("interchouette.db");
        let data = dir.path().join("data");
        let store = Store::open_writable(&db, &data).unwrap();
        store
            .replace_all(&[
                KnowledgeDoc {
                    slug: "en/gregory-roussac".into(),
                    lang: "en".into(),
                    title: "Gregory Roussac".into(),
                    body: "Gregory Roussac founded Interchouette ITC.".into(),
                },
                KnowledgeDoc {
                    slug: "en/interchouette-overview".into(),
                    lang: "en".into(),
                    title: "Overview".into(),
                    body: "Interchouette overview body.".into(),
                },
                KnowledgeDoc {
                    slug: "en/cv-summary".into(),
                    lang: "en".into(),
                    title: "CV".into(),
                    body: "CV summary body.".into(),
                },
                KnowledgeDoc {
                    slug: "en/public-projects".into(),
                    lang: "en".into(),
                    title: "Projects".into(),
                    body: "Public projects body.".into(),
                },
            ])
            .unwrap();
        drop(store);
        (db, data)
    }

    #[test]
    fn default_hosts_include_public_and_render() {
        assert!(DEFAULT_ALLOWED_HOSTS.contains(&"mcp.interchouette.net"));
        assert!(DEFAULT_ALLOWED_HOSTS.contains(&"interchouette-mcp-latest.onrender.com"));
        assert!(DEFAULT_ALLOWED_HOSTS.contains(&"localhost"));
    }

    #[tokio::test]
    async fn health_returns_ok_json() {
        let dir = tempdir().unwrap();
        let (db, data) = seed_store(&dir);
        let app = build_app(
            &db,
            &data,
            "https://interchouette.net",
            DEFAULT_ALLOWED_HOSTS
                .iter()
                .map(|h| (*h).to_string())
                .collect(),
        )
        .unwrap();

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["ok"], true);
    }

    #[tokio::test]
    async fn tools_return_seeded_documents() {
        let dir = tempdir().unwrap();
        let (db, data) = seed_store(&dir);
        let store = Arc::new(Store::open_readonly(db, data).unwrap());
        let mcp = KnowledgeMcp::new(store);

        let profile = mcp.get_gregory_profile().await.unwrap();
        assert!(!profile.is_error.unwrap_or(false));
        let contact = mcp.get_contact().await.unwrap();
        assert!(!contact.is_error.unwrap_or(false));
        let overview = mcp
            .get_interchouette_overview(Parameters(LangArgs {
                lang: Some("en".into()),
            }))
            .await
            .unwrap();
        assert!(!overview.is_error.unwrap_or(false));
        let cv = mcp.get_cv_summary().await.unwrap();
        assert!(!cv.is_error.unwrap_or(false));
        let projects = mcp.list_public_projects().await.unwrap();
        assert!(!projects.is_error.unwrap_or(false));
        let hits = mcp
            .search_knowledge(Parameters(SearchArgs {
                query: "Gregory Roussac".into(),
                lang: Some("en".into()),
            }))
            .await
            .unwrap();
        assert!(!hits.is_error.unwrap_or(false));
    }

    #[tokio::test]
    async fn missing_document_is_tool_error() {
        let dir = tempdir().unwrap();
        let (db, data) = seed_store(&dir);
        let store = Arc::new(Store::open_readonly(db, data).unwrap());
        let mcp = KnowledgeMcp::new(store);
        let err = mcp
            .get_interchouette_overview(Parameters(LangArgs {
                lang: Some("nl".into()),
            }))
            .await;
        assert!(err.is_err());
    }
}

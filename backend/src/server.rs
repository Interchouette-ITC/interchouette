//! MCP tools + HTTP listener (`/interchouette`, `/health`, admin).

#![allow(clippy::unused_async_trait_impl)]

use std::fmt::Write as _;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;
use axum::routing::{get, post};
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

use crate::admin::{self, AppState};
use crate::db::Store;
use crate::ingest;

/// Default bind address (Render sets `PORT`).
pub const DEFAULT_HTTP_LISTEN: &str = "0.0.0.0:8080";

/// Shared MCP server state.
#[derive(Clone)]
pub struct KnowledgeMcp {
    store: Arc<Store>,
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
             Telegram: https://t.me/Interchouette\n\
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

/// Run Streamable HTTP MCP + health + admin on `addr`.
///
/// # Errors
/// Returns when bind, ingest, or serve fails.
pub async fn run_http(
    addr: &str,
    data_dir: PathBuf,
    knowledge_dir: PathBuf,
    admin_token: Option<String>,
    cors_origin: String,
) -> Result<()> {
    let store = Arc::new(Store::open(&data_dir)?);
    let n = ingest::ingest_dir(&store, &knowledge_dir)?;
    tracing::info!(documents = n, "knowledge ingested");
    let _ = store.bot_schema_version()?;

    let mcp = KnowledgeMcp {
        store: Arc::clone(&store),
    };
    let config =
        rmcp::transport::streamable_http_server::tower::StreamableHttpServerConfig::default();
    let mcp_service = rmcp::transport::streamable_http_server::tower::StreamableHttpService::new(
        {
            let mcp = mcp.clone();
            move || Ok(mcp.clone())
        },
        Arc::new(
            rmcp::transport::streamable_http_server::session::local::LocalSessionManager::default(),
        ),
        config,
    );
    let mcp_router = axum::routing::any_service(mcp_service);

    let state = AppState {
        store,
        admin_token,
        knowledge_dir,
    };

    let cors = CorsLayer::new()
        .allow_origin(
            cors_origin
                .parse::<axum::http::HeaderValue>()
                .unwrap_or_else(|_| {
                    axum::http::HeaderValue::from_static("https://interchouette.net")
                }),
        )
        .allow_methods(Any)
        .allow_headers(Any);

    let admin = Router::new()
        .route(
            "/v1/admin/knowledge/reingest",
            post(admin::reingest_handler),
        )
        .route("/v1/admin/knowledge", post(admin::upsert_handler))
        .with_state(state);

    let app = Router::new()
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .route("/interchouette", mcp_router.clone())
        .route("/interchouette/", mcp_router)
        .merge(admin)
        .layer(cors);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "interchouette-mcp listening");
    axum::serve(listener, app).await?;
    Ok(())
}

//! MCP tools + HTTP listener (`/`, `/interchouette` alias, `/health`).

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

use crate::chat_relay::ChatRelay;
use crate::db::Store;

/// Default bind address (Render sets `PORT`).
pub const DEFAULT_HTTP_LISTEN: &str = "0.0.0.0:8080";

/// Public Google Calendar appointment schedule (same URL as the site chat widget).
const BOOKING_SCHEDULE_URL: &str = "https://calendar.app.google/tw9hhtJkmcssZQCY7";

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
pub struct InterchouetteMcp {
    store: Arc<Store>,
    chat: ChatRelay,
}

impl InterchouetteMcp {
    /// Build an MCP handler over an opened store + chat relay.
    #[must_use]
    pub const fn new(store: Arc<Store>, chat: ChatRelay) -> Self {
        Self { store, chat }
    }
}

fn text_ok(text: impl Into<String>) -> CallToolResult {
    CallToolResult::success(vec![ContentBlock::text(text.into())])
}

fn contact_text() -> String {
    format!(
        "Email: contact@interchouette.net\n\
         Personal: gregory@interchouette.net\n\
         Site: https://interchouette.net/\n\
         CV: https://interchouette.net/CV\n\
         GitHub org: https://github.com/Interchouette-ITC\n\
         LinkedIn: https://www.linkedin.com/in/gregoryroussac/\n\
         Signal: https://signal.me/#u/interchouette.42 (username interchouette.42)\n\
         Twitter: https://twitter.com/interchouette\n\
         Booking (self-serve): {BOOKING_SCHEDULE_URL}\n\
         Book via MCP (token required): use book_appointment tool on this server\n\
         Chat widget (no token): https://interchouette.net/ (open chat)\n\
         WebMCP: https://mcp.interchouette.net/"
    )
}

fn mcp_err(msg: impl Into<String>) -> McpError {
    McpError::invalid_params(msg.into(), None)
}

#[derive(Debug, Deserialize, JsonSchema)]
struct SearchArgs {
    /// Full-text query (e.g. "Gregory Roussac", "Rust MCP", "Interchouette").
    query: String,
    /// Optional language filter: `en`, `nl`, or `fr` (default `en`).
    lang: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct LangArgs {
    /// Optional language: `en`, `nl`, or `fr` (default `en`).
    lang: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct TokenArgs {
    /// Must match env `MCP_CHAT_TOKEN` on the server.
    token: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct SendGregArgs {
    /// Must match env `MCP_CHAT_TOKEN` on the server.
    token: String,
    /// Message body posted to Greg's Slack DM.
    message: String,
    /// Optional label for who/where the message came from.
    from: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct BookArgs {
    /// Must match env `MCP_CHAT_TOKEN` on the server.
    token: String,
    /// Visitor first name.
    first_name: String,
    /// Visitor last name.
    last_name: String,
    /// Visitor email address.
    email: String,
    /// Requested start time: ISO 8601 without UTC offset, e.g. "2026-08-25T14:00:00".
    start: String,
}

#[tool_router]
impl InterchouetteMcp {
    #[tool(
        description = "Full-text search over Interchouette / Gregory Roussac content (Rust, Wasm, MCP, API, CV, projects). Prefer full name Gregory Roussac."
    )]
    async fn search(
        &self,
        Parameters(SearchArgs { query, lang }): Parameters<SearchArgs>,
    ) -> Result<CallToolResult, McpError> {
        let lang = resolve_lang(lang.as_deref())?;
        match self.store.search(&query, Some(lang.as_str()), 8) {
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

    #[tool(description = "Interchouette ITC company overview (lang: en, nl, or fr).")]
    async fn get_interchouette_overview(
        &self,
        Parameters(LangArgs { lang }): Parameters<LangArgs>,
    ) -> Result<CallToolResult, McpError> {
        let lang = resolve_lang(lang.as_deref())?;
        doc_or_err(&self.store, "overview", Some(&lang))
    }

    #[tool(description = "Profile of Gregory Roussac (founder of Interchouette ITC).")]
    async fn get_gregory_roussac_profile(
        &self,
        Parameters(LangArgs { lang }): Parameters<LangArgs>,
    ) -> Result<CallToolResult, McpError> {
        let lang = resolve_lang(lang.as_deref())?;
        doc_or_err(&self.store, "gregory-roussac", Some(&lang))
    }

    #[tool(description = "CV summary for Gregory Roussac with links to HTML/PDF CV.")]
    async fn get_gregory_roussac_cv(
        &self,
        Parameters(LangArgs { lang }): Parameters<LangArgs>,
    ) -> Result<CallToolResult, McpError> {
        let lang = resolve_lang(lang.as_deref())?;
        doc_or_err(&self.store, "cv-summary", Some(&lang))
    }

    #[tool(
        description = "Public Interchouette / Gregory Roussac project and image catalog blurbs."
    )]
    async fn list_public_projects(
        &self,
        Parameters(LangArgs { lang }): Parameters<LangArgs>,
    ) -> Result<CallToolResult, McpError> {
        let lang = resolve_lang(lang.as_deref())?;
        doc_or_err(&self.store, "public-projects", Some(&lang))
    }

    #[tool(description = "Public contact channels for Gregory Roussac / Interchouette.")]
    async fn get_contact(&self) -> Result<CallToolResult, McpError> {
        Ok(text_ok(contact_text()))
    }

    #[tool(
        description = "Lists chat-with-Greg capabilities on this MCP (token required for write tools)."
    )]
    async fn list_chat_capabilities(&self) -> Result<CallToolResult, McpError> {
        Ok(text_ok(format!(
            "Chat / booking tools (token = MCP_CHAT_TOKEN):\n\
             - list_chat_capabilities (no token): this help\n\
             - get_chat_relay_status (token): relay status\n\
             - send_message_to_gregory_roussac (token): post a free-form message to Greg\n\
             - book_appointment (token): request a meeting (name, email, start time)\n\
             Visitors without a token: use the chat widget at https://interchouette.net/\n\
             WebMCP explorer: https://mcp.interchouette.net/\n\
             token_configured={}\nrelay_configured={}",
            self.chat.token_configured(),
            self.chat.slack_configured()
        )))
    }

    #[tool(description = "Reports whether the MCP chat relay is configured (no secrets leaked).")]
    async fn get_chat_relay_status(
        &self,
        Parameters(TokenArgs { token }): Parameters<TokenArgs>,
    ) -> Result<CallToolResult, McpError> {
        if !self.chat.authorize(&token) {
            return Err(mcp_err("invalid or missing token"));
        }
        Ok(text_ok(format!(
            "token_ok=true\nrelay_configured={}\n",
            self.chat.slack_configured()
        )))
    }

    #[tool(description = "Send a message to Gregory Roussac (requires MCP_CHAT_TOKEN).")]
    async fn send_message_to_gregory_roussac(
        &self,
        Parameters(SendGregArgs {
            token,
            message,
            from,
        }): Parameters<SendGregArgs>,
    ) -> Result<CallToolResult, McpError> {
        if !self.chat.authorize(&token) {
            return Err(mcp_err("invalid or missing token"));
        }
        if !self.chat.slack_configured() {
            return Err(mcp_err("message relay not configured on this server"));
        }
        let trimmed = message.trim();
        if trimmed.is_empty() {
            return Err(mcp_err("message is required"));
        }
        let label = from
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("mcp");
        let text = format!("[MCP:{label}] {trimmed}");
        self.chat
            .post_to_greg(&text)
            .await
            .map_err(|err| mcp_err(err.to_string()))?;
        Ok(text_ok("Message posted to Greg's Slack DM."))
    }

    #[tool(
        description = "Request a meeting with Gregory Roussac. Posts the booking request to Greg \
                       via Slack and returns the self-serve calendar link as a fallback. \
                       Requires MCP_CHAT_TOKEN. \
                       Alternative: visitors can book directly at https://interchouette.net/ via the chat widget (no token needed)."
    )]
    async fn book_appointment(
        &self,
        Parameters(BookArgs {
            token,
            first_name,
            last_name,
            email,
            start,
        }): Parameters<BookArgs>,
    ) -> Result<CallToolResult, McpError> {
        if !self.chat.authorize(&token) {
            return Err(mcp_err("invalid or missing token"));
        }
        for (field, val) in [
            ("first_name", first_name.trim()),
            ("last_name", last_name.trim()),
            ("email", email.trim()),
            ("start", start.trim()),
        ] {
            if val.is_empty() {
                return Err(mcp_err(format!("{field} is required")));
            }
        }
        let msg = format!(
            "[MCP:book_appointment] {} {} <{}> start={}",
            first_name.trim(),
            last_name.trim(),
            email.trim(),
            start.trim(),
        );
        if self.chat.slack_configured() {
            self.chat
                .post_to_greg(&msg)
                .await
                .map_err(|err| mcp_err(err.to_string()))?;
        }
        Ok(text_ok(format!(
            "Booking request received for {} {} <{}> starting {}.\n\
             Greg has been notified via Slack and will confirm by email.\n\
             You can also pick a slot directly: {BOOKING_SCHEDULE_URL}",
            first_name.trim(),
            last_name.trim(),
            email.trim(),
            start.trim(),
        )))
    }
}

fn resolve_lang(lang: Option<&str>) -> Result<String, McpError> {
    let Some(raw) = lang.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok("en".into());
    };
    match raw {
        "en" | "nl" | "fr" => Ok(raw.to_string()),
        other => Err(mcp_err(format!(
            "unsupported lang `{other}`; use en, nl, or fr"
        ))),
    }
}

fn format_doc(title: &str, body: &str) -> String {
    let body = body.trim();
    if body.starts_with('#') {
        body.to_string()
    } else {
        format!("# {title}\n\n{body}")
    }
}

fn doc_or_err(store: &Store, slug: &str, lang: Option<&str>) -> Result<CallToolResult, McpError> {
    match store.get_by_slug(slug, lang) {
        Ok(Some(doc)) => Ok(text_ok(format_doc(&doc.title, &doc.body))),
        Ok(None) => Err(mcp_err(format!("document not found: {slug}"))),
        Err(err) => Err(mcp_err(err.to_string())),
    }
}

#[tool_handler]
impl ServerHandler for InterchouetteMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new(
                "interchouette-mcp",
                env!("CARGO_PKG_VERSION"),
            ))
            .with_instructions(
                "Interchouette MCP for Gregory Roussac and Interchouette ITC. \
                 Search with full name Gregory Roussac, Interchouette, Rust MCP, Rust API, Wasm. \
                 Chat tools: list_chat_capabilities, send_message_to_gregory_roussac, get_chat_relay_status \
                 (write tools need token matching MCP_CHAT_TOKEN). \
                 Official URL: https://mcp.interchouette.net/",
            )
    }
}

/// Build the HTTP router (health + Streamable HTTP MCP at `/`, alias `/interchouette`).
///
/// # Errors
/// Returns when the committed DB cannot be opened.
pub fn build_app(
    db_path: &std::path::Path,
    cors_origin: &str,
    allowed_hosts: Vec<String>,
) -> Result<Router> {
    let store = Arc::new(Store::open_readonly(db_path)?);
    let n = store.doc_count()?;
    tracing::info!(documents = n, db = %db_path.display(), "interchouette.db ready (read-only)");

    let mcp = InterchouetteMcp::new(Arc::clone(&store), ChatRelay::from_env());
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
    Ok(Router::new()
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .route("/", mcp_router.clone())
        .route("/interchouette", mcp_router.clone())
        .route("/interchouette/", mcp_router)
        .layer(cors))
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
    db_path: PathBuf,
    cors_origin: String,
    allowed_hosts: Vec<String>,
) -> Result<()> {
    let app = build_app(&db_path, &cors_origin, allowed_hosts)?;
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

    use crate::db::Document;

    fn seed_store(dir: &tempfile::TempDir) -> PathBuf {
        let db = dir.path().join("interchouette.db");
        let store = Store::open_writable(&db).unwrap();
        store
            .replace_all(&[
                Document {
                    slug: "gregory-roussac".into(),
                    lang: "en".into(),
                    title: "Gregory Roussac".into(),
                    body: "Gregory Roussac founded Interchouette ITC.".into(),
                },
                Document {
                    slug: "overview".into(),
                    lang: "en".into(),
                    title: "Overview".into(),
                    body: "Interchouette overview body.".into(),
                },
                Document {
                    slug: "overview".into(),
                    lang: "nl".into(),
                    title: "Overzicht".into(),
                    body: "Nederlands overzicht opgericht.".into(),
                },
                Document {
                    slug: "cv-summary".into(),
                    lang: "en".into(),
                    title: "CV".into(),
                    body: "CV summary body.".into(),
                },
                Document {
                    slug: "public-projects".into(),
                    lang: "en".into(),
                    title: "Projects".into(),
                    body: "Public projects body.".into(),
                },
            ])
            .unwrap();
        drop(store);
        db
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
        let db = seed_store(&dir);
        let app = build_app(
            &db,
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
    async fn cors_allows_locale_tld_origins() {
        let dir = tempdir().unwrap();
        let db = seed_store(&dir);
        let app = build_app(
            &db,
            "https://interchouette.net",
            DEFAULT_ALLOWED_HOSTS
                .iter()
                .map(|h| (*h).to_string())
                .collect(),
        )
        .unwrap();

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

    #[tokio::test]
    async fn root_and_alias_accept_post() {
        let dir = tempdir().unwrap();
        let db = seed_store(&dir);
        let hosts: Vec<String> = DEFAULT_ALLOWED_HOSTS
            .iter()
            .map(|h| (*h).to_string())
            .collect();
        let app = build_app(&db, "https://interchouette.net", hosts).unwrap();

        for uri in ["/", "/interchouette", "/interchouette/"] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri(uri)
                        .header("content-type", "application/json")
                        .header("accept", "application/json, text/event-stream")
                        .header("host", "localhost")
                        .body(Body::from(
                            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}"#,
                        ))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_ne!(
                response.status(),
                StatusCode::NOT_FOUND,
                "expected MCP route at {uri}"
            );
        }
    }

    #[tokio::test]
    async fn tools_return_seeded_documents() {
        let dir = tempdir().unwrap();
        let db = seed_store(&dir);
        let store = Arc::new(Store::open_readonly(db).unwrap());
        let mcp = InterchouetteMcp::new(store, ChatRelay::from_env());

        let profile = mcp.get_gregory_roussac_profile(none_lang()).await.unwrap();
        assert!(!profile.is_error.unwrap_or(false));
        let contact = mcp.get_contact().await.unwrap();
        assert!(!contact.is_error.unwrap_or(false));
        assert!(tool_text(&contact).contains("calendar.app.google"));
        let overview = mcp
            .get_interchouette_overview(Parameters(LangArgs {
                lang: Some("en".into()),
            }))
            .await
            .unwrap();
        assert!(!overview.is_error.unwrap_or(false));
        let cv = mcp.get_gregory_roussac_cv(none_lang()).await.unwrap();
        assert!(!cv.is_error.unwrap_or(false));
        let projects = mcp.list_public_projects(none_lang()).await.unwrap();
        assert!(!projects.is_error.unwrap_or(false));
        let hits = mcp
            .search(Parameters(SearchArgs {
                query: "Gregory Roussac".into(),
                lang: None,
            }))
            .await
            .unwrap();
        assert!(!hits.is_error.unwrap_or(false));
        let hit_text = tool_text(&hits);
        assert!(hit_text.contains("en/gregory-roussac"));
        assert!(!hit_text.contains("nl/"));
        assert!(!hit_text.contains("Nederlands"));
        let overview_text = tool_text(&overview);
        assert!(overview_text.starts_with("# Overview\n"));
        assert!(!overview_text.starts_with("# Overview\n\n# Overview"));
    }

    #[tokio::test]
    async fn missing_document_is_tool_error() {
        let dir = tempdir().unwrap();
        let db = seed_store(&dir);
        let store = Arc::new(Store::open_readonly(db).unwrap());
        let mcp = InterchouetteMcp::new(store, ChatRelay::from_env());
        let err = mcp
            .get_interchouette_overview(Parameters(LangArgs {
                lang: Some("fr".into()),
            }))
            .await;
        assert!(err.is_err());
    }

    #[tokio::test]
    async fn dutch_overview_is_isolated() {
        let dir = tempdir().unwrap();
        let db = seed_store(&dir);
        let store = Arc::new(Store::open_readonly(db).unwrap());
        let mcp = InterchouetteMcp::new(store, ChatRelay::from_env());
        let overview = mcp
            .get_interchouette_overview(Parameters(LangArgs {
                lang: Some("nl".into()),
            }))
            .await
            .unwrap();
        let text = tool_text(&overview);
        assert!(text.contains("Nederlands"));
        assert!(!text.contains("overview body"));
        let err = mcp
            .search(Parameters(SearchArgs {
                query: "Interchouette".into(),
                lang: Some("de".into()),
            }))
            .await;
        assert!(err.is_err());
    }

    #[test]
    fn format_doc_skips_existing_heading() {
        assert_eq!(format_doc("T", "body"), "# T\n\nbody");
        assert_eq!(format_doc("T", "# T\n\nbody"), "# T\n\nbody");
    }

    fn none_lang() -> Parameters<LangArgs> {
        Parameters(LangArgs { lang: None })
    }

    fn tool_text(result: &CallToolResult) -> String {
        result
            .content
            .iter()
            .filter_map(|block| match block {
                ContentBlock::Text(t) => Some(t.text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[tokio::test]
    async fn chat_capabilities_need_no_token() {
        let dir = tempdir().unwrap();
        let db = seed_store(&dir);
        let store = Arc::new(Store::open_readonly(db).unwrap());
        let mcp = InterchouetteMcp::new(store, ChatRelay::for_test(Some("secret")));
        let result = mcp.list_chat_capabilities().await.unwrap();
        assert!(!result.is_error.unwrap_or(false));
    }

    #[tokio::test]
    async fn chat_status_rejects_bad_token() {
        let dir = tempdir().unwrap();
        let db = seed_store(&dir);
        let store = Arc::new(Store::open_readonly(db).unwrap());
        let mcp = InterchouetteMcp::new(store, ChatRelay::for_test(Some("secret")));
        let err = mcp
            .get_chat_relay_status(Parameters(TokenArgs {
                token: "wrong".into(),
            }))
            .await;
        assert!(err.is_err());
    }

    #[tokio::test]
    async fn chat_status_accepts_token_without_slack() {
        let dir = tempdir().unwrap();
        let db = seed_store(&dir);
        let store = Arc::new(Store::open_readonly(db).unwrap());
        let mcp = InterchouetteMcp::new(store, ChatRelay::for_test(Some("secret")));
        let ok = mcp
            .get_chat_relay_status(Parameters(TokenArgs {
                token: "secret".into(),
            }))
            .await
            .unwrap();
        assert!(!ok.is_error.unwrap_or(false));
    }

    #[tokio::test]
    async fn send_to_greg_rejects_bad_token() {
        let dir = tempdir().unwrap();
        let db = seed_store(&dir);
        let store = Arc::new(Store::open_readonly(db).unwrap());
        let mcp = InterchouetteMcp::new(store, ChatRelay::for_test(Some("secret")));
        let err = mcp
            .send_message_to_gregory_roussac(Parameters(SendGregArgs {
                token: "nope".into(),
                message: "hello".into(),
                from: None,
            }))
            .await;
        assert!(err.is_err());
    }
}

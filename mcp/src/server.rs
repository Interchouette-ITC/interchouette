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
    model::{
        CallToolResult, ContentBlock, Implementation, ListResourcesResult,
        ReadResourceRequestParams, ReadResourceResponse, ReadResourceResult, Resource,
        ResourceContents, ServerCapabilities, ServerInfo,
    },
    service::RequestContext,
    tool, tool_handler, tool_router, ErrorData as McpError, RoleServer, ServerHandler,
};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};

use crate::chat_relay::ChatRelay;
use crate::db::Store;
use crate::publications::{self, PubsBranch};

/// Default bind address (Render sets `PORT`).
pub const DEFAULT_HTTP_LISTEN: &str = "0.0.0.0:8080";

/// Public Google Calendar appointment schedule (same URL as the site chat widget).
const BOOKING_SCHEDULE_URL: &str = "https://calendar.app.google/tw9hhtJkmcssZQCY7";

/// Stable public resource URIs (HTTPS; read returns a short text pointer, not a binary download).
const RESOURCE_CV_PDF: &str = "https://interchouette.net/CV/Gregory_Roussac.pdf";
const RESOURCE_CV_HTML: &str = "https://interchouette.net/CV";
const RESOURCE_NEWS_RSS: &str = "https://api.interchouette.net/v1/news/rss.xml";
const RESOURCE_NEWS_ATOM: &str = "https://api.interchouette.net/v1/news/atom.xml";
const RESOURCE_MCP_CARD: &str = "https://interchouette.net/.well-known/mcp.json";

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
    /// Base URL of the Interchouette API host (`api.interchouette.net`), from env `CHAT_BACKEND_URL`.
    chat_backend_url: Option<String>,
    http: reqwest::Client,
}

impl InterchouetteMcp {
    /// Build an MCP handler over an opened store + chat relay.
    #[must_use]
    pub fn new(store: Arc<Store>, chat: ChatRelay) -> Self {
        let chat_backend_url = std::env::var("CHAT_BACKEND_URL")
            .ok()
            .filter(|s| !s.is_empty());
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .user_agent(concat!(
                "interchouette-mcp/",
                env!("CARGO_PKG_VERSION"),
                " (+https://mcp.interchouette.net/)"
            ))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            store,
            chat,
            chat_backend_url,
            http,
        }
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

#[derive(Debug, Deserialize, JsonSchema)]
struct DocSlugArgs {
    /// Document slug (e.g. `itcy`, `contact`, `products-shipped`).
    slug: String,
    /// Optional language: `en`, `nl`, or `fr` (default `en`).
    lang: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct PubsListArgs {
    /// Branch: `posts` (default), `drafts`, `tweets`, or `drafts_tweet`.
    branch: Option<String>,
    /// Max artefacts to return (default 20, max 50).
    limit: Option<u32>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct PubsGetArgs {
    /// Artefact id (e.g. `POST-20260820-000001`).
    id: String,
    /// Branch: `posts` (default), `drafts`, `tweets`, or `drafts_tweet`.
    branch: Option<String>,
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
        description = "Public Interchouette / Gregory Roussac project blurbs (legacy stub). Prefer list_shipped_products and list_projects_in_progress."
    )]
    async fn list_public_projects(
        &self,
        Parameters(LangArgs { lang }): Parameters<LangArgs>,
    ) -> Result<CallToolResult, McpError> {
        let lang = resolve_lang(lang.as_deref())?;
        doc_or_err(&self.store, "public-projects", Some(&lang))
    }

    #[tool(
        description = "Public contact channels for Gregory Roussac / Interchouette (lang: en, nl, or fr)."
    )]
    async fn get_contact(
        &self,
        Parameters(LangArgs { lang }): Parameters<LangArgs>,
    ) -> Result<CallToolResult, McpError> {
        let lang = resolve_lang(lang.as_deref())?;
        doc_or_err(&self.store, "contact", Some(&lang))
    }

    #[tool(
        description = "ITCy persona: disclosed AI mascot / LinkedIn-X operator (lang: en, nl, or fr)."
    )]
    async fn get_itcy(
        &self,
        Parameters(LangArgs { lang }): Parameters<LangArgs>,
    ) -> Result<CallToolResult, McpError> {
        let lang = resolve_lang(lang.as_deref())?;
        doc_or_err(&self.store, "itcy", Some(&lang))
    }

    #[tool(description = "Shipped and beta Interchouette ITC products (from public catalog).")]
    async fn list_shipped_products(
        &self,
        Parameters(LangArgs { lang }): Parameters<LangArgs>,
    ) -> Result<CallToolResult, McpError> {
        let lang = resolve_lang(lang.as_deref())?;
        doc_or_err(&self.store, "products-shipped", Some(&lang))
    }

    #[tool(description = "In-progress (wip) Interchouette ITC projects (from public catalog).")]
    async fn list_projects_in_progress(
        &self,
        Parameters(LangArgs { lang }): Parameters<LangArgs>,
    ) -> Result<CallToolResult, McpError> {
        let lang = resolve_lang(lang.as_deref())?;
        doc_or_err(&self.store, "products-wip", Some(&lang))
    }

    #[tool(
        description = "SoundCloud Play ITC radio metadata and URLs only (playback is on the site / WebMCP)."
    )]
    async fn get_radio_info(
        &self,
        Parameters(LangArgs { lang }): Parameters<LangArgs>,
    ) -> Result<CallToolResult, McpError> {
        let lang = resolve_lang(lang.as_deref())?;
        doc_or_err(&self.store, "radio", Some(&lang))
    }

    #[tool(
        description = "Fetch one knowledge document by slug (e.g. itcy, contact, radio, products-shipped)."
    )]
    async fn get_doc_by_slug(
        &self,
        Parameters(DocSlugArgs { slug, lang }): Parameters<DocSlugArgs>,
    ) -> Result<CallToolResult, McpError> {
        let lang = resolve_lang(lang.as_deref())?;
        let slug = slug.trim();
        if slug.is_empty() {
            return Err(mcp_err("slug is required"));
        }
        doc_or_err(&self.store, slug, Some(&lang))
    }

    #[tool(
        description = "List knowledge document slugs, languages, and titles in interchouette.db."
    )]
    async fn list_knowledge_index(&self) -> Result<CallToolResult, McpError> {
        match self.store.list_docs() {
            Ok(rows) if rows.is_empty() => Ok(text_ok("No documents.")),
            Ok(rows) => {
                let mut out = String::from("slug\tlang\ttitle\n");
                for (slug, lang, title) in rows {
                    let _ = writeln!(out, "{slug}\t{lang}\t{title}");
                }
                Ok(text_ok(out))
            }
            Err(err) => Err(mcp_err(err.to_string())),
        }
    }

    #[tool(
        description = "List ITCy publication artefacts from GitHub itcy-publications (live; not in SQLite). Default branch: posts."
    )]
    async fn list_publications(
        &self,
        Parameters(PubsListArgs { branch, limit }): Parameters<PubsListArgs>,
    ) -> Result<CallToolResult, McpError> {
        let branch = resolve_pubs_branch(branch.as_deref())?;
        let limit = limit.unwrap_or(20).clamp(1, 50) as usize;
        let fetch = publications::fetch_branch_tree(&self.http, branch).await;
        if let Some(err) = fetch.error {
            return Err(mcp_err(format!("publications list failed: {err}")));
        }
        if fetch.artefacts.is_empty() {
            return Ok(text_ok(format!(
                "No artefacts on branch `{}` \
                 (https://github.com/{}/{}/tree/{}).",
                branch.git_name(),
                publications::ORG_OWNER,
                publications::PUBS_REPO,
                branch.git_name()
            )));
        }
        let mut out = format!(
            "Publications on `{}/{}` branch `{}` (showing up to {limit}):\n",
            publications::ORG_OWNER,
            publications::PUBS_REPO,
            branch.git_name()
        );
        for art in fetch.artefacts.into_iter().take(limit) {
            let _ = writeln!(out, "- {} ({})", art.id, art.body_path);
        }
        Ok(text_ok(out))
    }

    #[tool(
        description = "Fetch one ITCy publication body + subject from GitHub itcy-publications by artefact id."
    )]
    async fn get_publication(
        &self,
        Parameters(PubsGetArgs { id, branch }): Parameters<PubsGetArgs>,
    ) -> Result<CallToolResult, McpError> {
        let branch = resolve_pubs_branch(branch.as_deref())?;
        let id = id.trim();
        if id.is_empty() {
            return Err(mcp_err("id is required"));
        }
        let fetch = publications::fetch_branch_tree(&self.http, branch).await;
        if let Some(err) = fetch.error {
            return Err(mcp_err(format!("publications tree failed: {err}")));
        }
        let Some(art) = publications::find_artefact(&fetch.artefacts, id) else {
            return Err(mcp_err(format!(
                "artefact `{id}` not found on branch `{}`",
                branch.git_name()
            )));
        };
        let body = publications::fetch_file_text(&self.http, branch, &art.body_path)
            .await
            .map_err(mcp_err)?;
        let subject = publications::fetch_file_text(&self.http, branch, &art.meta_path)
            .await
            .ok()
            .map(|m| publications::subject_from_meta(&m))
            .unwrap_or_default();
        let mut out = format!(
            "# {}\n\nbranch: {}\npath: {}\n",
            art.id,
            branch.git_name(),
            art.body_path
        );
        if !subject.is_empty() {
            let _ = writeln!(out, "subject: {subject}");
        }
        out.push('\n');
        out.push_str(&body);
        Ok(text_ok(out))
    }

    #[tool(description = "ITC LinkedIn and X posts from API GET /v1/news \
                       (JSON cached about every 4 hours on api.interchouette.net).")]
    async fn get_news(&self) -> Result<CallToolResult, McpError> {
        let base = self
            .chat_backend_url
            .as_deref()
            .unwrap_or("https://api.interchouette.net")
            .trim_end_matches('/');
        let url = format!("{base}/v1/news?locale=en");
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|err| mcp_err(format!("news API unreachable: {err}")))?;
        if !resp.status().is_success() {
            return Err(mcp_err(format!("news API HTTP {}", resp.status().as_u16())));
        }
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|err| mcp_err(format!("news API invalid JSON: {err}")))?;
        Ok(text_ok(format_news_snapshot(&body)))
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
        description = "Book a meeting with Gregory Roussac directly on his calendar. \
                       Requires MCP_CHAT_TOKEN. Provide first_name, last_name, email, and \
                       start (ISO 8601 datetime without UTC offset, e.g. 2026-08-25T14:00:00). \
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
        let Some(base_url) = &self.chat_backend_url else {
            return Err(mcp_err(
                "booking not available (CHAT_BACKEND_URL not configured)",
            ));
        };
        let url = format!("{base_url}/v1/book");
        let resp = self
            .http
            .post(&url)
            .json(&json!({
                "token": token,
                "first_name": first_name.trim(),
                "last_name": last_name.trim(),
                "email": email.trim(),
                "start": start.trim(),
            }))
            .send()
            .await
            .map_err(|err| mcp_err(format!("chat backend unreachable: {err}")))?;
        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body: serde_json::Value = resp.json().await.unwrap_or_default();
            let msg = body["error"].as_str().unwrap_or("booking failed");
            return Err(mcp_err(format!("[{status}] {msg}")));
        }
        let body: serde_json::Value = resp.json().await.unwrap_or_default();
        let html_link = body["html_link"].as_str().unwrap_or(BOOKING_SCHEDULE_URL);
        Ok(text_ok(format!(
            "Meeting booked for {} {} <{}> starting {}.\n\
             Google Calendar event: {html_link}\n\
             You will receive a calendar invite at {}.",
            first_name.trim(),
            last_name.trim(),
            email.trim(),
            start.trim(),
            email.trim(),
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

fn resolve_pubs_branch(branch: Option<&str>) -> Result<PubsBranch, McpError> {
    branch
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map_or(Ok(PubsBranch::Posts), |name| {
            PubsBranch::parse(name).ok_or_else(|| {
                mcp_err(format!(
                    "unsupported branch `{name}` (use posts, drafts, tweets, or drafts_tweet)"
                ))
            })
        })
}

fn public_resources() -> Vec<Resource> {
    vec![
        Resource::new(RESOURCE_CV_PDF, "cv-pdf")
            .with_title("Gregory Roussac CV (PDF)")
            .with_description("Public CV PDF on interchouette.net")
            .with_mime_type("application/pdf"),
        Resource::new(RESOURCE_CV_HTML, "cv-html")
            .with_title("Gregory Roussac CV (HTML)")
            .with_description("Public CV page on interchouette.net")
            .with_mime_type("text/html"),
        Resource::new(RESOURCE_NEWS_RSS, "news-rss")
            .with_title("ITC news RSS")
            .with_description("LinkedIn and X posts RSS feed")
            .with_mime_type("application/rss+xml"),
        Resource::new(RESOURCE_NEWS_ATOM, "news-atom")
            .with_title("ITC news Atom")
            .with_description("LinkedIn and X posts Atom feed")
            .with_mime_type("application/atom+xml"),
        Resource::new(RESOURCE_MCP_CARD, "mcp-server-card")
            .with_title("Remote MCP server card")
            .with_description("Well-known MCP discovery document")
            .with_mime_type("application/json"),
    ]
}

fn read_public_resource(uri: &str) -> Result<ReadResourceResult, McpError> {
    let known = public_resources();
    let Some(res) = known.iter().find(|r| r.uri == uri) else {
        return Err(mcp_err(format!("unknown resource URI: {uri}")));
    };
    let title = res.title.as_deref().unwrap_or(res.name.as_str());
    let desc = res.description.as_deref().unwrap_or("");
    let text = format!("{title}\n{desc}\n\nOpen this public URL directly:\n{uri}\n");
    let mime = res.mime_type.clone().unwrap_or_else(|| "text/plain".into());
    Ok(ReadResourceResult::new(vec![ResourceContents::text(
        text, uri,
    )
    .with_mime_type(mime)]))
}

fn format_doc(title: &str, body: &str) -> String {
    let body = body.trim();
    if body.starts_with('#') {
        body.to_string()
    } else {
        format!("# {title}\n\n{body}")
    }
}

fn format_news_snapshot(body: &serde_json::Value) -> String {
    let mut out = String::from(
        "Interchouette News (API cache, about every 4 hours)\n\
         Page: https://interchouette.net/news\n\
         JSON: https://api.interchouette.net/v1/news\n\
         RSS: https://api.interchouette.net/v1/news/rss.xml\n\
         Atom: https://api.interchouette.net/v1/news/atom.xml\n",
    );
    if let Some(at) = body.get("fetched_at").and_then(|v| v.as_str()) {
        let _ = writeln!(out, "Fetched at: {at}");
    }
    if let Some(ttl) = body
        .get("cache_ttl_secs")
        .and_then(serde_json::Value::as_u64)
    {
        let _ = writeln!(out, "Cache TTL seconds: {ttl}");
    }
    out.push('\n');
    let sections = [
        ("Interchouette on X", "itc_x"),
        ("Interchouette on LinkedIn", "itc_linkedin"),
    ];
    for (label, key) in sections {
        let _ = writeln!(out, "## {label}");
        let items = body
            .pointer(&format!("/feeds/{key}/items"))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if items.is_empty() {
            out.push_str("(no posts)\n\n");
            continue;
        }
        for item in items {
            let text = item.get("text").and_then(|v| v.as_str()).unwrap_or("");
            let url = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let when = item
                .get("published_at")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if when.is_empty() {
                let _ = writeln!(out, "- {text}");
            } else {
                let _ = writeln!(out, "- {text} ({when})");
            }
            if !url.is_empty() {
                let _ = writeln!(out, "  {url}");
            }
        }
        out.push('\n');
    }
    out.trim_end().to_string()
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
        ServerInfo::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .build(),
        )
        .with_server_info(Implementation::new(
            "interchouette-mcp",
            env!("CARGO_PKG_VERSION"),
        ))
        .with_instructions(
            "Interchouette MCP for Gregory Roussac and Interchouette ITC. \
             Search with full name Gregory Roussac, Interchouette, Rust MCP, Rust API, Wasm. \
             Knowledge: search, get_doc_by_slug, list_knowledge_index, get_itcy, \
             list_shipped_products, list_projects_in_progress, get_radio_info, get_contact. \
             Publications (live GitHub): list_publications, get_publication. \
             Chat tools: list_chat_capabilities, send_message_to_gregory_roussac, get_chat_relay_status \
             (write tools need token matching MCP_CHAT_TOKEN). \
             Official URL: https://mcp.interchouette.net/",
        )
    }

    async fn list_resources(
        &self,
        _request: Option<rmcp::model::PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        Ok(ListResourcesResult::with_all_items(public_resources()))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, McpError> {
        read_public_resource(&request.uri).map(ReadResourceResponse::from)
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
                Document {
                    slug: "contact".into(),
                    lang: "en".into(),
                    title: "Contact".into(),
                    body: "Email: contact@interchouette.net\nBooking: https://calendar.app.google/tw9hhtJkmcssZQCY7".into(),
                },
                Document {
                    slug: "itcy".into(),
                    lang: "en".into(),
                    title: "ITCy".into(),
                    body: "ITCy is the disclosed AI mascot.".into(),
                },
                Document {
                    slug: "radio".into(),
                    lang: "en".into(),
                    title: "Radio".into(),
                    body: "Playlist: https://soundcloud.com/labonnevoile/sets/playitc".into(),
                },
                Document {
                    slug: "products-shipped".into(),
                    lang: "en".into(),
                    title: "Shipped".into(),
                    body: "- itcy: shipped".into(),
                },
                Document {
                    slug: "products-wip".into(),
                    lang: "en".into(),
                    title: "WIP".into(),
                    body: "- open-trading: wip".into(),
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
        let contact = mcp.get_contact(none_lang()).await.unwrap();
        assert!(!contact.is_error.unwrap_or(false));
        assert!(tool_text(&contact).contains("calendar.app.google"));
        let itcy = mcp.get_itcy(none_lang()).await.unwrap();
        assert!(tool_text(&itcy).contains("ITCy"));
        let shipped = mcp.list_shipped_products(none_lang()).await.unwrap();
        assert!(tool_text(&shipped).contains("itcy"));
        let radio = mcp.get_radio_info(none_lang()).await.unwrap();
        assert!(tool_text(&radio).contains("soundcloud.com"));
        let by_slug = mcp
            .get_doc_by_slug(Parameters(DocSlugArgs {
                slug: "contact".into(),
                lang: None,
            }))
            .await
            .unwrap();
        assert!(tool_text(&by_slug).contains("contact@interchouette.net"));
        let index = mcp.list_knowledge_index().await.unwrap();
        let index_text = tool_text(&index);
        assert!(index_text.contains("itcy"));
        assert!(index_text.contains("products-shipped"));
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

    #[test]
    fn public_resources_cover_cv_and_feeds() {
        let uris: Vec<_> = public_resources().into_iter().map(|r| r.uri).collect();
        assert!(uris.contains(&RESOURCE_CV_PDF.to_string()));
        assert!(uris.contains(&RESOURCE_NEWS_RSS.to_string()));
        assert!(uris.contains(&RESOURCE_MCP_CARD.to_string()));
        let read = read_public_resource(RESOURCE_CV_PDF).unwrap();
        assert_eq!(read.contents.len(), 1);
        let err = read_public_resource("https://example.com/missing");
        assert!(err.is_err());
    }

    #[test]
    fn resolve_pubs_branch_defaults_to_posts() {
        assert_eq!(resolve_pubs_branch(None).unwrap(), PubsBranch::Posts);
        assert!(resolve_pubs_branch(Some("nope")).is_err());
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

    #[test]
    fn format_news_snapshot_lists_posts_and_feed_urls() {
        let text = format_news_snapshot(&json!({
            "fetched_at": "2026-08-20T12:00:00.000Z",
            "feeds": {
                "itc_x": {
                    "items": [{
                        "text": "Hello from X",
                        "url": "https://x.com/interchouette/status/1",
                        "published_at": "2026-08-19T00:00:00Z"
                    }]
                },
                "itc_linkedin": { "items": [] }
            }
        }));
        assert!(text.contains("Hello from X"));
        assert!(text.contains("https://api.interchouette.net/v1/news"));
        assert!(text.contains("https://api.interchouette.net/v1/news/rss.xml"));
        assert!(text.contains("https://api.interchouette.net/v1/news/atom.xml"));
        assert!(text.contains("(no posts)"));
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

    #[tokio::test]
    async fn book_appointment_rejects_bad_token() {
        let dir = tempdir().unwrap();
        let db = seed_store(&dir);
        let store = Arc::new(Store::open_readonly(db).unwrap());
        let mcp = InterchouetteMcp::new(store, ChatRelay::for_test(Some("secret")));
        let err = mcp
            .book_appointment(Parameters(BookArgs {
                token: "wrong".into(),
                first_name: "Alice".into(),
                last_name: "Test".into(),
                email: "alice@example.com".into(),
                start: "2026-09-01T10:00:00".into(),
            }))
            .await;
        assert!(err.is_err());
        let msg = err.unwrap_err().message;
        assert!(msg.contains("token"), "expected token error, got: {msg}");
    }

    #[tokio::test]
    async fn book_appointment_without_backend_url_returns_error() {
        // CHAT_BACKEND_URL is not set => booking unavailable.
        std::env::remove_var("CHAT_BACKEND_URL");
        let dir = tempdir().unwrap();
        let db = seed_store(&dir);
        let store = Arc::new(Store::open_readonly(db).unwrap());
        let mcp = InterchouetteMcp::new(store, ChatRelay::for_test(Some("secret")));
        let err = mcp
            .book_appointment(Parameters(BookArgs {
                token: "secret".into(),
                first_name: "Alice".into(),
                last_name: "Test".into(),
                email: "alice@example.com".into(),
                start: "2026-09-01T10:00:00".into(),
            }))
            .await;
        assert!(err.is_err());
        let msg = err.unwrap_err().message;
        assert!(
            msg.contains("CHAT_BACKEND_URL"),
            "expected backend URL error, got: {msg}"
        );
    }
}

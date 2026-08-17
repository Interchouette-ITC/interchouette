//! Away mode: `OpenRouter` plus remote Interchouette MCP over HTTP.
//!
//! Chat does not open `interchouette.db`. Context comes from the MCP HTTP API.

use serde_json::{json, Value};

const SYSTEM_PROMPT: &str = "You are ITCy, the Linux owl assistant for Interchouette ITC \
    (Gregory Roussac). Speak English only. You are an AI, never pretend to be Greg. \
    Be concise, friendly, and helpful. Prefer inviting the visitor to leave an email \
    so Greg can follow up. Use only the MCP context provided.";

const DEFAULT_MCP_URL: &str = "https://mcp.interchouette.net/";
const MCP_SEARCH_TOOL: &str = "search";

/// Away LLM helper backed by remote MCP search.
#[derive(Clone)]
pub struct AwayBrain {
    mcp_url: String,
    openrouter_key: String,
    model: String,
    client: reqwest::Client,
    /// Test-only static context (skips MCP HTTP).
    static_context: Option<String>,
}

impl AwayBrain {
    /// From env: `MCP_URL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (all required).
    ///
    /// # Panics
    /// When any of those env vars is missing or empty.
    #[must_use]
    pub fn from_env() -> Self {
        let mcp_url = required_env("MCP_URL").unwrap_or_else(|| DEFAULT_MCP_URL.into());
        let openrouter_key = required_env("OPENROUTER_API_KEY")
            .unwrap_or_else(|| panic!("OPENROUTER_API_KEY is required"));
        let model = required_env("OPENROUTER_MODEL")
            .unwrap_or_else(|| panic!("OPENROUTER_MODEL is required"));
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(45))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            mcp_url,
            openrouter_key,
            model,
            client,
            static_context: None,
        }
    }

    /// Test helper with fixed MCP context (no MCP / `OpenRouter` network calls).
    #[cfg(test)]
    #[must_use]
    pub fn with_static_context(context: impl Into<String>) -> Self {
        Self {
            mcp_url: "http://127.0.0.1/unused".into(),
            openrouter_key: "test-key".into(),
            model: "none".into(),
            client: reqwest::Client::new(),
            static_context: Some(context.into()),
        }
    }

    /// Answer as `ITCy` using remote MCP context + `OpenRouter`.
    pub async fn reply(&self, visitor_text: &str) -> String {
        let context = self.rag_context(visitor_text).await;
        match self
            .call_openrouter(&self.openrouter_key, &context, visitor_text)
            .await
        {
            Ok(text) if !text.trim().is_empty() => text,
            Ok(_) => {
                tracing::warn!("openrouter empty reply; falling back to MCP snippet");
                rag_fallback(&context, visitor_text)
            }
            Err(err) => {
                tracing::warn!(error = %err, "openrouter failed; MCP snippet fallback");
                rag_fallback(&context, visitor_text)
            }
        }
    }

    async fn rag_context(&self, query: &str) -> String {
        if let Some(ctx) = &self.static_context {
            return ctx.clone();
        }
        match self.mcp_search(query).await {
            Ok(text) if !text.trim().is_empty() => text,
            Ok(_) => String::from("(no MCP hits)"),
            Err(err) => {
                tracing::warn!(error = %err, mcp = %self.mcp_url, "remote MCP search failed");
                String::from("(MCP unavailable)")
            }
        }
    }

    async fn mcp_search(&self, query: &str) -> anyhow::Result<String> {
        let session_id = self.mcp_initialize().await?;
        let _ = self
            .client
            .post(&self.mcp_url)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .header("mcp-session-id", &session_id)
            .json(&json!({
                "jsonrpc": "2.0",
                "method": "notifications/initialized"
            }))
            .send()
            .await;
        let resp = self
            .client
            .post(&self.mcp_url)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .header("mcp-session-id", &session_id)
            .json(&mcp_search_call_body(query))
            .send()
            .await?;
        let status = resp.status();
        let body = resp.text().await?;
        if !status.is_success() {
            anyhow::bail!("MCP tools/call HTTP {status}: {body}");
        }
        let payload = parse_sse_jsonrpc(&body)?;
        if let Some(err) = payload.get("error") {
            tracing::warn!(mcp = %self.mcp_url, error = %err, "MCP tools/call JSON-RPC error");
            anyhow::bail!("MCP tools/call error: {err}");
        }
        extract_tool_text(&payload)
    }

    async fn mcp_initialize(&self) -> anyhow::Result<String> {
        let resp = self
            .client
            .post(&self.mcp_url)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .json(&json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": { "name": "interchouette-chat", "version": "0.2.0" }
                }
            }))
            .send()
            .await?;
        let session = resp
            .headers()
            .get("mcp-session-id")
            .and_then(|v| v.to_str().ok())
            .map(str::to_string)
            .ok_or_else(|| anyhow::anyhow!("MCP initialize missing mcp-session-id"))?;
        let status = resp.status();
        let body = resp.text().await?;
        if !status.is_success() {
            anyhow::bail!("MCP initialize HTTP {status}: {body}");
        }
        Ok(session)
    }

    async fn call_openrouter(
        &self,
        key: &str,
        context: &str,
        visitor_text: &str,
    ) -> anyhow::Result<String> {
        let user = format!("Knowledge context:\n{context}\n\nVisitor message:\n{visitor_text}");
        let resp = self
            .client
            .post("https://openrouter.ai/api/v1/chat/completions")
            .bearer_auth(key)
            .header("HTTP-Referer", "https://interchouette.net/")
            .header("X-Title", "Interchouette chat")
            .json(&json!({
                "model": self.model,
                "max_tokens": 320,
                "messages": [
                    { "role": "system", "content": SYSTEM_PROMPT },
                    { "role": "user", "content": user }
                ]
            }))
            .send()
            .await?;
        let status = resp.status();
        let body: Value = resp.json().await?;
        if !status.is_success() {
            anyhow::bail!("openrouter HTTP {status}: {body}");
        }
        body["choices"][0]["message"]["content"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| anyhow::anyhow!("openrouter missing content"))
    }
}

fn parse_sse_jsonrpc(body: &str) -> anyhow::Result<Value> {
    for line in body.lines() {
        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(data) {
            if v.get("jsonrpc").is_some() {
                return Ok(v);
            }
        }
    }
    if let Ok(v) = serde_json::from_str::<Value>(body) {
        return Ok(v);
    }
    anyhow::bail!("no JSON-RPC payload in MCP SSE body")
}

fn extract_tool_text(payload: &Value) -> anyhow::Result<String> {
    let content = &payload["result"]["content"];
    if let Some(arr) = content.as_array() {
        let texts: Vec<&str> = arr
            .iter()
            .filter_map(|item| item["text"].as_str())
            .collect();
        if !texts.is_empty() {
            return Ok(texts.join("\n\n"));
        }
    }
    if let Some(text) = content.as_str() {
        return Ok(text.to_string());
    }
    anyhow::bail!("MCP tools/call missing text content")
}

fn required_env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|s| !s.is_empty())
}

fn mcp_search_call_body(query: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": MCP_SEARCH_TOOL,
            "arguments": { "query": query }
        }
    })
}

fn rag_fallback(context: &str, visitor_text: &str) -> String {
    if context.contains("(no MCP") || context.contains("(MCP unavailable)") {
        return String::from(
            "Hi, I am ITCy, Greg's AI. Greg is away and I could not match that to our public notes yet. \
             Leave your email here or write contact@interchouette.net and he will follow up.",
        );
    }
    let snippet = synthesize_brief(context);
    if snippet.is_empty() {
        return format!(
            "Hi, I am ITCy, Greg's AI. Greg is away. Ask me about Interchouette, Rust, Wasm, or leave \
             your email so Greg can follow up. (You asked about: {visitor_text})"
        );
    }
    format!(
        "Hi, I am ITCy, Greg's AI. {snippet} Want Greg personally? Leave your email here or write \
         contact@interchouette.net."
    )
}

/// Turn raw MCP markdown into one short visitor-facing sentence (never dump headings).
fn synthesize_brief(context: &str) -> String {
    let preferred = context
        .split("## ")
        .find(|block| {
            let lower = block.to_ascii_lowercase();
            lower.contains("interchouette itc (english)")
                || lower.contains("gregory roussac\n")
                || lower.starts_with("gregory roussac")
        })
        .unwrap_or(context);

    let plain = preferred
        .lines()
        .map(str::trim)
        .filter(|line| {
            !line.is_empty()
                && !line.starts_with('#')
                && !line.eq_ignore_ascii_case("keywords")
                && !line.starts_with("Keywords")
        })
        .map(|line| line.replace("**", ""))
        .collect::<Vec<_>>()
        .join(" ");

    let plain = plain.replace("…", " ").replace("  ", " ");
    let sentence = plain
        .split(". ")
        .next()
        .unwrap_or(plain.as_str())
        .trim()
        .trim_end_matches('.');

    if sentence.is_empty() {
        return String::new();
    }
    let mut out = sentence.to_string();
    if out.chars().count() > 220 {
        out = out.chars().take(217).collect();
        out.push('…');
    } else {
        out.push('.');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn fallback_uses_static_context_when_openrouter_fails() {
        let brain = AwayBrain::with_static_context(
            "### Gregory\nGregory Roussac does Rust and Wasm freelance work.",
        );
        let reply = brain.reply("Rust Wasm").await;
        assert!(reply.contains("ITCy"));
        assert!(reply.contains("Gregory") || reply.contains("Rust"));
    }

    #[test]
    fn parses_sse_tool_result() {
        let body = "data: \nid: 0\n\ndata: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"hello mcp\"}]}}\n\n";
        let v = parse_sse_jsonrpc(body).unwrap();
        assert_eq!(extract_tool_text(&v).unwrap(), "hello mcp");
    }

    #[test]
    fn tools_call_uses_search_not_search_knowledge() {
        let body = mcp_search_call_body("Gregory Roussac");
        assert_eq!(body["params"]["name"], MCP_SEARCH_TOOL);
        assert_ne!(body["params"]["name"], "search_knowledge");
        assert_eq!(body["params"]["arguments"]["query"], "Gregory Roussac");
    }
}

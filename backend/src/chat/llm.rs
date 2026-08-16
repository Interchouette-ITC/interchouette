//! Away-mode `ITCy` replies: read-only knowledge FTS + optional `OpenRouter`.

use std::sync::Arc;

use serde_json::json;

use crate::db::Store;

const SYSTEM_PROMPT: &str = "You are ITCy, the Linux owl assistant for Interchouette ITC \
(Gregory Roussac). Speak English only. You are an AI, never pretend to be Greg. \
Be concise, friendly, and helpful. Prefer inviting the visitor to leave an email \
so Greg can follow up. Use only the knowledge context provided.";

/// Away LLM / RAG helper.
#[derive(Clone)]
pub struct AwayBrain {
    knowledge: Arc<Store>,
    openrouter_key: Option<String>,
    model: String,
    client: reqwest::Client,
}

impl AwayBrain {
    /// Build from knowledge store + env (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`).
    #[must_use]
    pub fn new(knowledge: Arc<Store>) -> Self {
        let openrouter_key = std::env::var("OPENROUTER_API_KEY")
            .ok()
            .filter(|s| !s.is_empty());
        let model = std::env::var("OPENROUTER_MODEL").unwrap_or_else(|_| "openrouter/auto".into());
        // Prefer a free model when unset is auto; allow override.
        let model = if model == "openrouter/auto" {
            "meta-llama/llama-3.2-3b-instruct:free".into()
        } else {
            model
        };
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(45))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            knowledge,
            openrouter_key,
            model,
            client,
        }
    }

    /// Answer as `ITCy` using RAG context.
    pub async fn reply(&self, visitor_text: &str) -> String {
        let context = self.rag_context(visitor_text);
        if let Some(key) = &self.openrouter_key {
            match self.call_openrouter(key, &context, visitor_text).await {
                Ok(text) if !text.trim().is_empty() => return text,
                Ok(_) => tracing::warn!("openrouter empty reply; falling back to RAG snippet"),
                Err(err) => tracing::warn!(error = %err, "openrouter failed; RAG fallback"),
            }
        }
        rag_fallback(&context, visitor_text)
    }

    fn rag_context(&self, query: &str) -> String {
        match self.knowledge.search(query, Some("en"), 4) {
            Ok(hits) if !hits.is_empty() => hits
                .into_iter()
                .map(|h| format!("### {} ({})\n{}", h.title, h.slug, h.snippet))
                .collect::<Vec<_>>()
                .join("\n\n"),
            Ok(_) => String::from("(no knowledge hits)"),
            Err(err) => {
                tracing::warn!(error = %err, "knowledge search failed");
                String::from("(knowledge unavailable)")
            }
        }
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
        let body: serde_json::Value = resp.json().await?;
        if !status.is_success() {
            anyhow::bail!("openrouter HTTP {status}: {body}");
        }
        body["choices"][0]["message"]["content"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| anyhow::anyhow!("openrouter missing content"))
    }
}

fn rag_fallback(context: &str, visitor_text: &str) -> String {
    if context.contains("(no knowledge") || context.contains("(knowledge unavailable)") {
        return format!(
            "Hi, I am ITCy 🦉, Greg's AI assistant. Greg is away right now. \
             I could not match that to our public notes yet. \
             Leave your email or write to contact@interchouette.net and Greg will follow up. \
             (You asked: {visitor_text})"
        );
    }
    format!(
        "Hi, I am ITCy 🦉 (AI assistant). Greg is away, so here is what I know from our public notes:\n\n\
         {context}\n\n\
         Greg will follow up if you leave a message or email contact@interchouette.net."
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{KnowledgeDoc, Store};
    use tempfile::tempdir;

    #[tokio::test]
    async fn fallback_uses_fts_without_openrouter() {
        let dir = tempdir().unwrap();
        let db = dir.path().join("k.db");
        let store = Store::open_writable(&db, dir.path()).unwrap();
        store
            .replace_all(&[KnowledgeDoc {
                slug: "en/gregory-roussac".into(),
                lang: "en".into(),
                title: "Gregory".into(),
                body: "Gregory Roussac does Rust and Wasm freelance work.".into(),
            }])
            .unwrap();
        drop(store);
        let knowledge = Arc::new(Store::open_readonly(&db, dir.path()).unwrap());
        let brain = AwayBrain {
            knowledge,
            openrouter_key: None,
            model: "none".into(),
            client: reqwest::Client::new(),
        };
        let reply = brain.reply("Rust Wasm").await;
        assert!(reply.contains("ITCy"));
        assert!(reply.contains("Gregory") || reply.contains("Rust"));
    }
}

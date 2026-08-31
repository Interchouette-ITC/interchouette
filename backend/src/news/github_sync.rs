//! Optional GitHub Contents API sync for `NEWS_DB`.
//!
//! Pull on boot (when configured), push after a merge that changed rows.
//! Token stays on the chat API host only - never in the Angular site.

use std::fmt::Write as _;
use std::path::Path;

use base64::Engine;
use reqwest::header::{AUTHORIZATION, USER_AGENT};
use reqwest::StatusCode;
use serde::Deserialize;
use serde_json::json;
use sqlx::SqlitePool;
use tracing::{info, warn};

const API_VERSION: &str = "2022-11-28";
const USER_AGENT_VALUE: &str = "interchouette-chat-news-archive";
const DEFAULT_REPO_OWNER: &str = "Interchouette-ITC";
const DEFAULT_REPO_NAME: &str = "interchouette";
const DEFAULT_REMOTE_PATH: &str = "db/news.db";
const DEFAULT_BRANCH: &str = "news-db";

/// GitHub Contents sync for the news `SQLite` file.
#[derive(Clone)]
pub struct GitHubNewsSync {
    client: reqwest::Client,
    token: String,
    owner: String,
    repo: String,
    remote_path: String,
    branch: String,
}

impl GitHubNewsSync {
    /// Build from `NEWS_GITHUB_TOKEN`. Repo/path/branch default to Interchouette org `dev` + `db/news.db`.
    #[must_use]
    pub fn from_env() -> Option<Self> {
        let token = std::env::var("NEWS_GITHUB_TOKEN").ok()?;
        let token = token.trim();
        if token.is_empty() {
            return None;
        }
        let (owner, repo) = std::env::var("NEWS_GITHUB_REPO")
            .ok()
            .and_then(|spec| parse_owner_repo(spec.trim()))
            .unwrap_or_else(|| (DEFAULT_REPO_OWNER.to_owned(), DEFAULT_REPO_NAME.to_owned()));
        let remote_path = std::env::var("NEWS_GITHUB_PATH")
            .ok()
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| DEFAULT_REMOTE_PATH.into());
        let branch = std::env::var("NEWS_GITHUB_BRANCH")
            .ok()
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| DEFAULT_BRANCH.into());
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_mins(1))
            .build()
            .ok()?;
        Some(Self {
            client,
            token: token.to_owned(),
            owner,
            repo,
            remote_path,
            branch,
        })
    }

    /// Download remote file onto `local_path` when it exists (404 = keep local / empty).
    pub async fn pull_to(&self, local_path: &Path) -> Result<(), String> {
        let Some(remote) = self.get_remote().await? else {
            info!(
                repo = %format!("{}/{}", self.owner, self.repo),
                path = %self.remote_path,
                branch = %self.branch,
                "news archive GitHub file missing; using local SQLite"
            );
            return Ok(());
        };
        let bytes = decode_content(&remote.content, remote.encoding.as_deref())?;
        if let Some(parent) = local_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| e.to_string())?;
        }
        tokio::fs::write(local_path, bytes)
            .await
            .map_err(|e| e.to_string())?;
        info!(
            path = %local_path.display(),
            bytes = remote.size.unwrap_or(0),
            "news archive pulled from GitHub"
        );
        Ok(())
    }

    /// Checkpoint `SQLite` then commit the file via Contents API when bytes changed.
    pub async fn push_from(&self, local_path: &Path, pool: &SqlitePool) -> Result<(), String> {
        if let Err(err) = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(pool)
            .await
        {
            warn!(error = %err, "news archive wal checkpoint failed");
        }
        let bytes = tokio::fs::read(local_path)
            .await
            .map_err(|e| e.to_string())?;
        let remote = self.get_remote().await?;
        if let Some(ref remote) = remote {
            let remote_bytes = decode_content(&remote.content, remote.encoding.as_deref())?;
            if remote_bytes == bytes {
                info!(
                    repo = %format!("{}/{}", self.owner, self.repo),
                    path = %self.remote_path,
                    branch = %self.branch,
                    bytes = bytes.len(),
                    "news archive GitHub push skipped (unchanged)"
                );
                return Ok(());
            }
        }
        let sha = remote.map(|remote| remote.sha);
        let content = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let url = self.contents_url(None);
        let mut body = json!({
            "message": "chore(news): update archive database",
            "content": content,
            "branch": self.branch,
        });
        if let Some(sha) = sha {
            body["sha"] = json!(sha);
        }
        let response = self
            .client
            .put(&url)
            .header(AUTHORIZATION, format!("Bearer {}", self.token))
            .header(USER_AGENT, USER_AGENT_VALUE)
            .header("X-GitHub-Api-Version", API_VERSION)
            .header("Accept", "application/vnd.github+json")
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = response.status();
        if status.is_success() {
            info!(
                repo = %format!("{}/{}", self.owner, self.repo),
                path = %self.remote_path,
                branch = %self.branch,
                bytes = bytes.len(),
                "news archive pushed to GitHub"
            );
            return Ok(());
        }
        let text = response.text().await.unwrap_or_default();
        Err(format!("GitHub Contents PUT {status}: {text}"))
    }

    async fn get_remote(&self) -> Result<Option<RemoteFile>, String> {
        let url = self.contents_url(Some(&self.branch));
        let response = self
            .client
            .get(&url)
            .header(AUTHORIZATION, format!("Bearer {}", self.token))
            .header(USER_AGENT, USER_AGENT_VALUE)
            .header("X-GitHub-Api-Version", API_VERSION)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if response.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("GitHub Contents GET {status}: {text}"));
        }
        let remote: RemoteFile = response.json().await.map_err(|e| e.to_string())?;
        Ok(Some(remote))
    }

    fn contents_url(&self, branch: Option<&str>) -> String {
        let mut url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}",
            self.owner, self.repo, self.remote_path
        );
        if let Some(branch) = branch {
            let _ = write!(url, "?ref={branch}");
        }
        url
    }
}

#[derive(Debug, Deserialize)]
struct RemoteFile {
    sha: String,
    content: String,
    encoding: Option<String>,
    size: Option<u64>,
}

fn parse_owner_repo(spec: &str) -> Option<(String, String)> {
    let (owner, repo) = spec.split_once('/')?;
    let owner = owner.trim();
    let repo = repo.trim();
    if owner.is_empty() || repo.is_empty() || repo.contains('/') {
        return None;
    }
    Some((owner.to_owned(), repo.to_owned()))
}

fn decode_content(content: &str, encoding: Option<&str>) -> Result<Vec<u8>, String> {
    let encoding = encoding.unwrap_or("base64");
    if encoding != "base64" {
        return Err(format!("unsupported GitHub content encoding: {encoding}"));
    }
    let compact: String = content.chars().filter(|c| !c.is_whitespace()).collect();
    base64::engine::general_purpose::STANDARD
        .decode(compact.as_bytes())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_owner_repo_when_env_unset() {
        let (owner, repo) = std::env::var("NEWS_GITHUB_REPO")
            .ok()
            .and_then(|spec| parse_owner_repo(spec.trim()))
            .unwrap_or_else(|| (DEFAULT_REPO_OWNER.to_owned(), DEFAULT_REPO_NAME.to_owned()));
        assert_eq!(owner, "Interchouette-ITC");
        assert_eq!(repo, "interchouette");
    }

    #[test]
    fn parses_owner_repo() {
        assert_eq!(
            parse_owner_repo("Interchouette-ITC/interchouette"),
            Some(("Interchouette-ITC".into(), "interchouette".into()))
        );
        assert!(parse_owner_repo("nope").is_none());
        assert!(parse_owner_repo("a/b/c").is_none());
    }

    #[test]
    fn decodes_padded_base64_with_newlines() {
        let raw = b"hello-news";
        let encoded = base64::engine::general_purpose::STANDARD.encode(raw);
        let with_nl = format!("{}\n", encoded.as_str());
        assert_eq!(
            decode_content(&with_nl, Some("base64")).unwrap(),
            raw.to_vec()
        );
    }
}

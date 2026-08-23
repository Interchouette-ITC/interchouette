//! Live read of public `itcy-publications` trees from GitHub (not stored in `SQLite`).

use std::time::Duration;

use serde::Deserialize;

/// Org publications owner.
pub const ORG_OWNER: &str = "Interchouette-ITC";
/// Publications repo name.
pub const PUBS_REPO: &str = "itcy-publications";

const TREE_TIMEOUT: Duration = Duration::from_secs(20);
const FILE_TIMEOUT: Duration = Duration::from_secs(15);

/// Publications branch = kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PubsBranch {
    /// `LinkedIn` draft artefacts.
    Drafts,
    /// Shipped `LinkedIn` post artefacts.
    Posts,
    /// X draft artefacts.
    DraftsTweet,
    /// Shipped X post artefacts.
    Tweets,
}

impl PubsBranch {
    /// Parse branch name (`posts`, `drafts`, `tweets`, `drafts_tweet`).
    #[must_use]
    pub fn parse(name: &str) -> Option<Self> {
        match name.trim() {
            "drafts" => Some(Self::Drafts),
            "posts" => Some(Self::Posts),
            "drafts_tweet" => Some(Self::DraftsTweet),
            "tweets" => Some(Self::Tweets),
            _ => None,
        }
    }

    /// Git ref name.
    #[must_use]
    pub const fn git_name(self) -> &'static str {
        match self {
            Self::Drafts => "drafts",
            Self::Posts => "posts",
            Self::DraftsTweet => "drafts_tweet",
            Self::Tweets => "tweets",
        }
    }
}

/// One artefact folder on a publications branch.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Artefact {
    /// Folder id (`DRAFT-…`, `POST-…`, `TWEET-…`, `XPOST-…`).
    pub id: String,
    /// Path to `body.md`.
    pub body_path: String,
    /// Sibling `meta.toml`.
    pub meta_path: String,
}

/// Tree fetch outcome.
#[derive(Debug, Clone)]
pub struct TreeFetch {
    /// Artefacts with a `body.md`.
    pub artefacts: Vec<Artefact>,
    /// Error line when the request failed.
    pub error: Option<String>,
}

#[derive(Deserialize)]
struct GitTree {
    #[serde(default)]
    tree: Vec<GitTreeEntry>,
    #[serde(default)]
    message: Option<String>,
}

#[derive(Deserialize)]
struct GitTreeEntry {
    path: String,
    #[serde(rename = "type")]
    kind: String,
}

fn optional_token() -> Option<String> {
    std::env::var("GITHUB_TOKEN")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn apply_auth(req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    match optional_token() {
        Some(t) => req.bearer_auth(t),
        None => req,
    }
}

/// `body.md` path -> artefact, or `None` if not a known id folder.
#[must_use]
pub fn artefact_from_body_path(path: &str) -> Option<Artefact> {
    let name = path.replace('\\', "/");
    if !name.ends_with("/body.md") {
        return None;
    }
    let id = name.split('/').find(|seg| is_artefact_id(seg))?.to_string();
    let meta_path = format!("{}meta.toml", name.trim_end_matches("body.md"));
    Some(Artefact {
        body_path: name,
        meta_path,
        id,
    })
}

fn is_artefact_id(seg: &str) -> bool {
    seg.starts_with("DRAFT-")
        || seg.starts_with("POST-")
        || seg.starts_with("TWEET-")
        || seg.starts_with("XPOST-")
}

/// Best-effort `subject = "…"` from pack `meta.toml`.
#[must_use]
pub fn subject_from_meta(meta: &str) -> String {
    for line in meta.lines() {
        let t = line.trim();
        let Some(rest) = t.strip_prefix("subject =") else {
            continue;
        };
        let rest = rest.trim();
        if let Some(inner) = rest.strip_prefix('"').and_then(|s| s.strip_suffix('"')) {
            return inner.replace("\\\"", "\"").replace("\\\\", "\\");
        }
    }
    String::new()
}

/// Recursive git tree for `Interchouette-ITC/itcy-publications` at `branch`.
pub async fn fetch_branch_tree(client: &reqwest::Client, branch: PubsBranch) -> TreeFetch {
    let url = format!(
        "https://api.github.com/repos/{ORG_OWNER}/{PUBS_REPO}/git/trees/{}?recursive=1",
        branch.git_name()
    );
    let resp = match apply_auth(client.get(&url).timeout(TREE_TIMEOUT))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return TreeFetch {
                artefacts: Vec::new(),
                error: Some(format!("request: {e}")),
            };
        }
    };
    let status = resp.status().as_u16();
    let parsed: GitTree = match resp.json().await {
        Ok(p) => p,
        Err(e) => {
            return TreeFetch {
                artefacts: Vec::new(),
                error: Some(format!("parse tree: {e}")),
            };
        }
    };
    if status == 403 {
        return TreeFetch {
            artefacts: Vec::new(),
            error: Some("rate limited or forbidden".into()),
        };
    }
    if status == 404 {
        return TreeFetch {
            artefacts: Vec::new(),
            error: Some(format!("branch `{}` not found", branch.git_name())),
        };
    }
    if !(200..300).contains(&status) {
        let msg = parsed.message.unwrap_or_else(|| format!("http {status}"));
        return TreeFetch {
            artefacts: Vec::new(),
            error: Some(msg),
        };
    }
    let mut artefacts: Vec<Artefact> = parsed
        .tree
        .into_iter()
        .filter(|e| e.kind == "blob")
        .filter_map(|e| artefact_from_body_path(&e.path))
        .collect();
    artefacts.sort_by(|a, b| b.id.cmp(&a.id));
    TreeFetch {
        artefacts,
        error: None,
    }
}

/// File text (`body.md` / `meta.toml`) at `path` on `branch`.
///
/// # Errors
///
/// Returns a short reason when the HTTP client fails or GitHub responds non-2xx.
pub async fn fetch_file_text(
    client: &reqwest::Client,
    branch: PubsBranch,
    path: &str,
) -> Result<String, String> {
    let url = format!(
        "https://raw.githubusercontent.com/{ORG_OWNER}/{PUBS_REPO}/{}/{path}",
        branch.git_name()
    );
    let resp = apply_auth(client.get(&url).timeout(FILE_TIMEOUT))
        .send()
        .await
        .map_err(|e| format!("request: {e}"))?;
    let status = resp.status().as_u16();
    if status == 404 {
        return Err("file not found".into());
    }
    if !(200..300).contains(&status) {
        return Err(format!("http {status}"));
    }
    resp.text().await.map_err(|e| format!("body: {e}"))
}

/// Resolve artefact by id from a tree listing.
#[must_use]
pub fn find_artefact<'a>(tree: &'a [Artefact], id: &str) -> Option<&'a Artefact> {
    let needle = id.trim();
    tree.iter().find(|a| a.id == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_flat_and_day_shard() {
        let flat = artefact_from_body_path("TWEET-20260813-000001/body.md").expect("flat");
        assert_eq!(flat.id, "TWEET-20260813-000001");
        assert_eq!(flat.meta_path, "TWEET-20260813-000001/meta.toml");

        let shard =
            artefact_from_body_path("2026/08/13/XPOST-20260813-000001/body.md").expect("shard");
        assert_eq!(shard.id, "XPOST-20260813-000001");
        assert_eq!(
            shard.meta_path,
            "2026/08/13/XPOST-20260813-000001/meta.toml"
        );
        assert!(artefact_from_body_path("README.md").is_none());
    }

    #[test]
    fn subject_line() {
        assert_eq!(
            subject_from_meta("kind = \"tweet\"\nsubject = \"owl merge\"\n"),
            "owl merge"
        );
        assert_eq!(subject_from_meta("kind = \"tweet\"\n"), "");
    }

    #[test]
    fn branch_parse() {
        assert_eq!(PubsBranch::parse("posts"), Some(PubsBranch::Posts));
        assert_eq!(PubsBranch::parse("nope"), None);
    }
}

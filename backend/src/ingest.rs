//! Load committed markdown knowledge into a derived `SQLite` FTS index.

use std::path::Path;

use anyhow::{bail, Context, Result};
use walkdir::WalkDir;

use crate::db::{KnowledgeDoc, Store};

/// Ingest all `*.md` under `knowledge_dir` (expects `en/` and `nl/` trees).
///
/// The markdown tree is the source of truth (git). `SQLite` is rebuilt from it.
///
/// # Errors
/// Returns when the directory is missing or a file cannot be read.
pub fn ingest_dir(store: &Store, knowledge_dir: &Path) -> Result<usize> {
    if !knowledge_dir.is_dir() {
        bail!("knowledge dir not found: {}", knowledge_dir.display());
    }
    let mut docs = Vec::new();
    for entry in WalkDir::new(knowledge_dir)
        .into_iter()
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let rel = path
            .strip_prefix(knowledge_dir)
            .with_context(|| format!("strip prefix {}", path.display()))?;
        let lang = rel
            .components()
            .next()
            .and_then(|c| c.as_os_str().to_str())
            .unwrap_or("en");
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("doc");
        let slug = format!("{lang}/{stem}");
        let body =
            std::fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
        let title = title_from_markdown(&body).unwrap_or_else(|| stem.replace('-', " "));
        docs.push(KnowledgeDoc {
            slug,
            lang: lang.to_string(),
            title,
            body,
        });
    }
    let n = docs.len();
    store.replace_all(&docs)?;
    Ok(n)
}

fn title_from_markdown(body: &str) -> Option<String> {
    body.lines()
        .find_map(|line| line.strip_prefix("# ").map(str::trim).map(str::to_string))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Store;
    use tempfile::tempdir;

    #[test]
    fn ingest_repo_knowledge_finds_gregory() {
        let knowledge = Path::new(env!("CARGO_MANIFEST_DIR")).join("../knowledge");
        let dir = tempdir().unwrap();
        let store = Store::open(dir.path()).unwrap();
        let n = ingest_dir(&store, &knowledge).unwrap();
        assert!(n >= 6);
        let hits = store.search("Gregory Roussac", None, 5).unwrap();
        assert!(!hits.is_empty());
        let rust = store.search("Rust MCP", None, 5).unwrap();
        assert!(!rust.is_empty());
    }
}

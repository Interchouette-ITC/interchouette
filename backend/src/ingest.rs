//! Load markdown knowledge files into `SQLite`.

use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use walkdir::WalkDir;

use crate::db::{KnowledgeDoc, Store};

/// Live corpus on the data disk: `$DATA_DIR/knowledge`.
///
/// First boot copies from `seed_dir` (image bundle) when the live tree has no
/// markdown yet. After that the disk is the source of truth - not a new image.
///
/// # Errors
/// Returns when directories cannot be created or seed files cannot be copied.
pub fn ensure_live_knowledge(data_dir: &Path, seed_dir: &Path) -> Result<PathBuf> {
    let live = data_dir.join("knowledge");
    std::fs::create_dir_all(&live)
        .with_context(|| format!("create live knowledge dir {}", live.display()))?;
    if count_markdown(&live) == 0 && seed_dir.is_dir() && count_markdown(seed_dir) > 0 {
        copy_markdown_tree(seed_dir, &live)?;
        tracing::info!(
            from = %seed_dir.display(),
            to = %live.display(),
            "seeded live knowledge from bundle"
        );
    }
    Ok(live)
}

/// Ingest all `*.md` under `knowledge_dir` (expects `en/` and `nl/` trees).
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

/// Persist one markdown doc under the live knowledge tree (source of truth).
///
/// # Errors
/// Returns when the parent directory or file write fails.
pub fn write_markdown_doc(knowledge_dir: &Path, doc: &KnowledgeDoc) -> Result<PathBuf> {
    let rel = markdown_rel_path(doc);
    let path = knowledge_dir.join(&rel);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    std::fs::write(&path, &doc.body).with_context(|| format!("write {}", path.display()))?;
    Ok(path)
}

fn markdown_rel_path(doc: &KnowledgeDoc) -> PathBuf {
    let slug = doc.slug.trim_end_matches(".md");
    if slug.contains('/') {
        PathBuf::from(format!("{slug}.md"))
    } else {
        PathBuf::from(format!("{}/{}.md", doc.lang, slug))
    }
}

fn count_markdown(root: &Path) -> usize {
    WalkDir::new(root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.path().is_file())
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("md"))
        .count()
}

fn copy_markdown_tree(from: &Path, to: &Path) -> Result<()> {
    for entry in WalkDir::new(from).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let rel = path
            .strip_prefix(from)
            .with_context(|| format!("strip prefix {}", path.display()))?;
        let dest = to.join(rel);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(path, &dest)
            .with_context(|| format!("copy {} -> {}", path.display(), dest.display()))?;
    }
    Ok(())
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

    #[test]
    fn seed_once_then_upsert_survives_reingest() {
        let seed = Path::new(env!("CARGO_MANIFEST_DIR")).join("../knowledge");
        let data = tempdir().unwrap();
        let live = ensure_live_knowledge(data.path(), &seed).unwrap();
        assert!(count_markdown(&live) >= 6);
        let store = Store::open(data.path()).unwrap();
        ingest_dir(&store, &live).unwrap();
        let doc = KnowledgeDoc {
            slug: "en/custom-note".into(),
            lang: "en".into(),
            title: "Custom".into(),
            body: "# Custom\n\nGregory Roussac custom live note".into(),
        };
        write_markdown_doc(&live, &doc).unwrap();
        store.upsert_doc(&doc).unwrap();
        // Second ensure must not wipe live tree.
        let live2 = ensure_live_knowledge(data.path(), &seed).unwrap();
        assert_eq!(live, live2);
        assert!(live2.join("en/custom-note.md").is_file());
        ingest_dir(&store, &live2).unwrap();
        let hits = store.search("custom live note", None, 5).unwrap();
        assert!(!hits.is_empty());
    }
}

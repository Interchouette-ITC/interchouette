//! Read-only Interchouette MCP store over committed `interchouette.db` (FTS5).

use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection, OpenFlags};

/// Opened MCP content database.
pub struct Store {
    conn: Mutex<Connection>,
}

impl Store {
    /// Open the committed MCP `.db` read-only.
    ///
    /// # Errors
    /// Returns when the file is missing or `SQLite` open fails.
    pub fn open_readonly(db_path: impl AsRef<Path>) -> Result<Self> {
        let db_path = db_path.as_ref();
        let conn = Connection::open_with_flags(
            db_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .with_context(|| format!("open read-only {}", db_path.display()))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Create/open a writable MCP DB (tests / local rebuild of the committed file).
    ///
    /// # Errors
    /// Returns when directories or `SQLite` open/migrate fail.
    pub fn open_writable(db_path: impl AsRef<Path>) -> Result<Self> {
        let db_path = db_path.as_ref();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(db_path)
            .with_context(|| format!("open writable {}", db_path.display()))?;
        migrate(&conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Replace all document rows from prepared docs (writable DB only).
    ///
    /// # Errors
    /// Returns when `SQLite` write fails.
    pub fn replace_all(&self, docs: &[Document]) -> Result<()> {
        let mut conn = lock(&self.conn, "store")?;
        {
            let tx = conn.transaction()?;
            tx.execute_batch("DELETE FROM documents; DELETE FROM documents_fts;")?;
            for doc in docs {
                tx.execute(
                    "INSERT INTO documents (slug, lang, title, body) VALUES (?1, ?2, ?3, ?4)",
                    params![doc.slug, doc.lang, doc.title, doc.body],
                )?;
                let rowid = tx.last_insert_rowid();
                tx.execute(
                    "INSERT INTO documents_fts (rowid, slug, lang, title, body) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![rowid, doc.slug, doc.lang, doc.title, doc.body],
                )?;
            }
            tx.commit()?;
        }
        drop(conn);
        Ok(())
    }

    /// Document count.
    ///
    /// # Errors
    /// Returns when the query fails.
    pub fn doc_count(&self) -> Result<i64> {
        let conn = lock(&self.conn, "store")?;
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))?;
        drop(conn);
        Ok(n)
    }

    /// Full-text search. `lang` defaults to `en` so locales never mix.
    ///
    /// # Errors
    /// Returns when the query fails.
    pub fn search(&self, query: &str, lang: Option<&str>, limit: usize) -> Result<Vec<SearchHit>> {
        let q = sanitize_fts_query(query);
        if q.is_empty() {
            bail!("empty search query");
        }
        let lang = lang.unwrap_or("en");
        let limit = i64::try_from(limit.clamp(1, 25)).unwrap_or(25);
        let conn = lock(&self.conn, "store")?;
        let mut stmt = conn.prepare(
            "SELECT slug, lang, title, snippet(documents_fts, 3, '', '', '…', 24)
             FROM documents_fts
             WHERE documents_fts MATCH ?1 AND lang = ?2
             ORDER BY rank
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(params![q, lang, limit], map_hit)?;
        let mut hits = Vec::new();
        for row in rows {
            hits.push(row?);
        }
        drop(stmt);
        drop(conn);
        Ok(hits)
    }

    /// Fetch a document body by slug (optional lang filter).
    ///
    /// # Errors
    /// Returns when the query fails.
    pub fn get_by_slug(&self, slug: &str, lang: Option<&str>) -> Result<Option<Document>> {
        let conn = lock(&self.conn, "store")?;
        let doc = if let Some(lang) = lang {
            let mut stmt = conn.prepare(
                "SELECT slug, lang, title, body FROM documents WHERE slug = ?1 AND lang = ?2 LIMIT 1",
            )?;
            let mut rows = stmt.query(params![slug, lang])?;
            rows.next()?.map(row_to_doc).transpose()?
        } else {
            let mut stmt = conn
                .prepare("SELECT slug, lang, title, body FROM documents WHERE slug = ?1 LIMIT 1")?;
            let mut rows = stmt.query(params![slug])?;
            rows.next()?.map(row_to_doc).transpose()?
        };
        drop(conn);
        Ok(doc)
    }

    /// List slugs and titles.
    ///
    /// # Errors
    /// Returns when the query fails.
    pub fn list_docs(&self) -> Result<Vec<(String, String, String)>> {
        let conn = lock(&self.conn, "store")?;
        let mut stmt =
            conn.prepare("SELECT slug, lang, title FROM documents ORDER BY lang, slug")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get(1)?, row.get(2)?))
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        drop(stmt);
        drop(conn);
        Ok(out)
    }
}

/// One MCP document.
#[derive(Debug, Clone)]
pub struct Document {
    pub slug: String,
    pub lang: String,
    pub title: String,
    pub body: String,
}

/// One FTS hit.
#[derive(Debug, Clone)]
pub struct SearchHit {
    pub slug: String,
    pub lang: String,
    pub title: String,
    pub snippet: String,
}

fn lock<'a>(mutex: &'a Mutex<Connection>, label: &str) -> Result<MutexGuard<'a, Connection>> {
    mutex
        .lock()
        .map_err(|_| anyhow::anyhow!("{label} db poisoned"))
}

fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY,
            slug TEXT NOT NULL,
            lang TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            UNIQUE(slug, lang)
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
            slug UNINDEXED,
            lang UNINDEXED,
            title,
            body,
            tokenize = 'porter unicode61'
        );
        ",
    )?;
    Ok(())
}

fn map_hit(row: &rusqlite::Row<'_>) -> rusqlite::Result<SearchHit> {
    Ok(SearchHit {
        slug: row.get(0)?,
        lang: row.get(1)?,
        title: row.get(2)?,
        snippet: row.get(3)?,
    })
}

fn row_to_doc(row: &rusqlite::Row<'_>) -> rusqlite::Result<Document> {
    Ok(Document {
        slug: row.get(0)?,
        lang: row.get(1)?,
        title: row.get(2)?,
        body: row.get(3)?,
    })
}

/// Turn user text into a safe FTS5 MATCH string (OR of tokens).
#[must_use]
pub fn sanitize_fts_query(raw: &str) -> String {
    raw.split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
        .filter(|t| !t.is_empty())
        .map(|t| {
            let escaped = t.replace('"', "");
            format!("\"{escaped}\"")
        })
        .collect::<Vec<_>>()
        .join(" OR ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn writable_then_readonly_search() {
        let dir = tempdir().unwrap();
        let db = dir.path().join("interchouette.db");
        let store = Store::open_writable(&db).unwrap();
        store
            .replace_all(&[Document {
                slug: "gregory-roussac".into(),
                lang: "en".into(),
                title: "Gregory Roussac".into(),
                body: "Gregory Roussac Interchouette Rust MCP API freelance".into(),
            }])
            .unwrap();
        drop(store);

        let ro = Store::open_readonly(&db).unwrap();
        let hits = ro.search("Gregory Roussac", Some("en"), 5).unwrap();
        assert!(!hits.is_empty());
        assert_eq!(hits[0].slug, "gregory-roussac");
        assert_eq!(ro.doc_count().unwrap(), 1);
    }

    #[test]
    fn search_without_lang_stays_english() {
        let dir = tempdir().unwrap();
        let db = dir.path().join("interchouette.db");
        let store = Store::open_writable(&db).unwrap();
        store
            .replace_all(&[
                Document {
                    slug: "overview".into(),
                    lang: "en".into(),
                    title: "Interchouette ITC".into(),
                    body: "English overview Hilversum Rust".into(),
                },
                Document {
                    slug: "overview".into(),
                    lang: "nl".into(),
                    title: "Interchouette ITC".into(),
                    body: "Nederlands overzicht Hilversum eenmanszaak".into(),
                },
                Document {
                    slug: "overview".into(),
                    lang: "fr".into(),
                    title: "Interchouette ITC".into(),
                    body: "Apercu francais Hilversum entreprise".into(),
                },
            ])
            .unwrap();
        let hits = store.search("Hilversum", None, 8).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].lang, "en");
        assert!(!hits[0].snippet.contains("Nederlands"));
        assert!(!hits[0].snippet.contains("Apercu"));
        let nl = store.search("Hilversum", Some("nl"), 8).unwrap();
        assert_eq!(nl.len(), 1);
        assert_eq!(nl[0].lang, "nl");
    }

    #[test]
    fn committed_repo_db_is_concentrated() {
        let db = Path::new(env!("CARGO_MANIFEST_DIR")).join("../db/interchouette.db");
        let store = Store::open_readonly(&db).unwrap();
        let listed = store.list_docs().unwrap();
        assert_eq!(listed.len(), 15);
        let mut langs = listed
            .iter()
            .map(|(_, lang, _)| lang.as_str())
            .collect::<Vec<_>>();
        langs.sort_unstable();
        langs.dedup();
        assert_eq!(langs, ["en", "fr", "nl"]);
        for (slug, _, _) in &listed {
            assert!(
                matches!(
                    slug.as_str(),
                    "overview"
                        | "gregory-roussac"
                        | "cv-summary"
                        | "public-projects"
                        | "news-feeds"
                ),
                "unexpected slug {slug}"
            );
            assert!(!slug.contains('/'), "slug still has lang prefix: {slug}");
        }
        let hits = store.search("Gregory Roussac", None, 8).unwrap();
        assert!(!hits.is_empty());
        assert!(hits.iter().all(|h| h.lang == "en"));
        let blob = hits
            .iter()
            .map(|h| format!("{} {}", h.title, h.snippet))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(!blob.contains("opgericht"));
        assert!(!blob.contains("fondee"));
        assert!(!blob.contains("Trefwoorden"));
        assert!(!blob.contains("Keywords"));
        let nl = store.search("Gregory Roussac", Some("nl"), 8).unwrap();
        assert!(!nl.is_empty());
        assert!(nl.iter().all(|h| h.lang == "nl"));
        let nl_blob = nl
            .iter()
            .map(|h| format!("{} {}", h.title, h.snippet))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(!nl_blob.contains("Internet is cool"));
        assert!(!nl_blob.contains("Keywords"));
    }

    #[test]
    fn sanitize_empty_and_tokens() {
        assert_eq!(sanitize_fts_query("   "), "");
        assert_eq!(
            sanitize_fts_query("Gregory Roussac"),
            "\"Gregory\" OR \"Roussac\""
        );
        assert_eq!(sanitize_fts_query("Rust-MCP"), "\"Rust-MCP\"");
    }
}

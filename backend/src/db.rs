//! `SQLite` knowledge store (FTS5) and bot stub DB.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection, OpenFlags};

/// Opened knowledge (read-only product DB) + bot stub.
pub struct Store {
    knowledge: Mutex<Connection>,
    bot: Mutex<Connection>,
    data_dir: PathBuf,
}

impl Store {
    /// Open the committed knowledge `.db` read-only, plus a writable bot stub under `data_dir`.
    ///
    /// # Errors
    /// Returns when the knowledge file is missing or `SQLite` open fails.
    pub fn open_readonly(
        knowledge_db: impl AsRef<Path>,
        data_dir: impl Into<PathBuf>,
    ) -> Result<Self> {
        let knowledge_db = knowledge_db.as_ref();
        let data_dir = data_dir.into();
        std::fs::create_dir_all(&data_dir)
            .with_context(|| format!("create data dir {}", data_dir.display()))?;

        let knowledge = Connection::open_with_flags(
            knowledge_db,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .with_context(|| format!("open read-only {}", knowledge_db.display()))?;

        let bot_path = data_dir.join("bot.sqlite");
        let bot =
            Connection::open(&bot_path).with_context(|| format!("open {}", bot_path.display()))?;
        migrate_bot(&bot)?;

        Ok(Self {
            knowledge: Mutex::new(knowledge),
            bot: Mutex::new(bot),
            data_dir,
        })
    }

    /// Create/open a writable knowledge DB (tests / local rebuild of the committed file).
    ///
    /// # Errors
    /// Returns when directories or `SQLite` open/migrate fail.
    pub fn open_writable(
        knowledge_db: impl AsRef<Path>,
        data_dir: impl Into<PathBuf>,
    ) -> Result<Self> {
        let knowledge_db = knowledge_db.as_ref();
        let data_dir = data_dir.into();
        if let Some(parent) = knowledge_db.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::create_dir_all(&data_dir)?;

        let knowledge = Connection::open(knowledge_db)
            .with_context(|| format!("open writable {}", knowledge_db.display()))?;
        migrate_knowledge(&knowledge)?;

        let bot_path = data_dir.join("bot.sqlite");
        let bot = Connection::open(&bot_path)?;
        migrate_bot(&bot)?;

        Ok(Self {
            knowledge: Mutex::new(knowledge),
            bot: Mutex::new(bot),
            data_dir,
        })
    }

    /// Data directory path.
    #[must_use]
    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    /// Bot schema version (keeps `bot.sqlite` live).
    ///
    /// # Errors
    /// Returns when the bot DB lock or query fails.
    pub fn bot_schema_version(&self) -> Result<i64> {
        let bot = lock(&self.bot, "bot")?;
        let v: i64 = bot.query_row(
            "SELECT version FROM schema_version WHERE id = 1",
            [],
            |row| row.get(0),
        )?;
        drop(bot);
        Ok(v)
    }

    /// Replace all knowledge rows from prepared docs (writable DB only).
    ///
    /// # Errors
    /// Returns when `SQLite` write fails.
    pub fn replace_all(&self, docs: &[KnowledgeDoc]) -> Result<()> {
        let mut conn = lock(&self.knowledge, "knowledge")?;
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
        let conn = lock(&self.knowledge, "knowledge")?;
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))?;
        drop(conn);
        Ok(n)
    }

    /// Full-text search.
    ///
    /// # Errors
    /// Returns when the query fails.
    pub fn search(&self, query: &str, lang: Option<&str>, limit: usize) -> Result<Vec<SearchHit>> {
        let q = sanitize_fts_query(query);
        if q.is_empty() {
            bail!("empty search query");
        }
        let limit = i64::try_from(limit.clamp(1, 25)).unwrap_or(25);
        let conn = lock(&self.knowledge, "knowledge")?;
        let mut hits = Vec::new();
        if let Some(lang) = lang {
            let mut stmt = conn.prepare(
                "SELECT slug, lang, title, snippet(documents_fts, 3, '', '', '…', 24)
                 FROM documents_fts
                 WHERE documents_fts MATCH ?1 AND lang = ?2
                 ORDER BY rank
                 LIMIT ?3",
            )?;
            let rows = stmt.query_map(params![q, lang, limit], map_hit)?;
            for row in rows {
                hits.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT slug, lang, title, snippet(documents_fts, 3, '', '', '…', 24)
                 FROM documents_fts
                 WHERE documents_fts MATCH ?1
                 ORDER BY rank
                 LIMIT ?2",
            )?;
            let rows = stmt.query_map(params![q, limit], map_hit)?;
            for row in rows {
                hits.push(row?);
            }
        }
        drop(conn);
        Ok(hits)
    }

    /// Fetch a document body by slug (optional lang filter).
    ///
    /// # Errors
    /// Returns when the query fails.
    pub fn get_by_slug(&self, slug: &str, lang: Option<&str>) -> Result<Option<KnowledgeDoc>> {
        let conn = lock(&self.knowledge, "knowledge")?;
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
        let conn = lock(&self.knowledge, "knowledge")?;
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

/// One knowledge document.
#[derive(Debug, Clone)]
pub struct KnowledgeDoc {
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

fn migrate_knowledge(conn: &Connection) -> Result<()> {
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

fn migrate_bot(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_version (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            version INTEGER NOT NULL
        );
        INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 1);
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

fn row_to_doc(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeDoc> {
    Ok(KnowledgeDoc {
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
        let db = dir.path().join("knowledge.db");
        let store = Store::open_writable(&db, dir.path()).unwrap();
        store
            .replace_all(&[KnowledgeDoc {
                slug: "en/gregory-roussac".into(),
                lang: "en".into(),
                title: "Gregory Roussac".into(),
                body: "Gregory Roussac Interchouette Rust MCP API freelance".into(),
            }])
            .unwrap();
        drop(store);

        let ro = Store::open_readonly(&db, dir.path()).unwrap();
        let hits = ro.search("Gregory Roussac", Some("en"), 5).unwrap();
        assert!(!hits.is_empty());
        assert_eq!(hits[0].slug, "en/gregory-roussac");
        assert_eq!(ro.doc_count().unwrap(), 1);
        assert_eq!(ro.bot_schema_version().unwrap(), 1);
    }

    #[test]
    fn committed_repo_db_searches() {
        let db = Path::new(env!("CARGO_MANIFEST_DIR")).join("../db/knowledge.db");
        let dir = tempdir().unwrap();
        let store = Store::open_readonly(&db, dir.path()).unwrap();
        assert!(store.doc_count().unwrap() >= 6);
        let hits = store.search("Gregory Roussac", None, 5).unwrap();
        assert!(!hits.is_empty());
    }
}

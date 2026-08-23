//! Dev-time compiler: `mcp/catalog/` → `db/interchouette.db`.

use std::fmt::Write as _;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Deserialize;

use crate::db::{Document, Store};
use crate::news_format::{
    format_news_week_doc, is_valid_week_id, news_week_slug, week_id_from_fetched_at,
};

const LANGS: [&str; 3] = ["en", "nl", "fr"];

/// One static document from `catalog/docs.toml`.
#[derive(Debug, Deserialize)]
struct CatalogDoc {
    slug: String,
    lang: String,
    title: String,
    body: String,
}

#[derive(Debug, Deserialize)]
struct DocsFile {
    doc: Vec<CatalogDoc>,
}

#[derive(Debug, Deserialize)]
struct CatalogProduct {
    id: String,
    repo: String,
    status: String,
    #[serde(default = "default_true")]
    public: bool,
    url: String,
    blurb_en: String,
    #[serde(default)]
    blurb_nl: String,
    #[serde(default)]
    blurb_fr: String,
}

const fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
struct ProductsFile {
    product: Vec<CatalogProduct>,
}

/// Rebuild committed MCP `SQLite` from catalog inputs.
///
/// # Errors
/// Returns when catalog files are missing or invalid, or the DB write fails.
pub fn build(db_path: impl AsRef<Path>, catalog_dir: impl AsRef<Path>) -> Result<()> {
    let catalog_dir = catalog_dir.as_ref();
    let docs = load_docs(&catalog_dir.join("docs.toml"))?;
    let products = load_products(&catalog_dir.join("products.toml"))?;
    let news = load_news_weeks(&catalog_dir.join("news"))?;
    let mut all = docs;
    all.extend(render_product_lists(&products));
    all.extend(news);
    let store = Store::open_writable(db_path.as_ref())?;
    store.replace_all(&all)?;
    Ok(())
}

fn load_docs(path: &Path) -> Result<Vec<Document>> {
    let raw = std::fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    let parsed: DocsFile =
        toml::from_str(&raw).with_context(|| format!("parse {}", path.display()))?;
    Ok(parsed
        .doc
        .into_iter()
        .map(|d| Document {
            slug: d.slug,
            lang: d.lang,
            title: d.title,
            body: d.body.trim().to_string(),
        })
        .collect())
}

fn load_products(path: &Path) -> Result<Vec<CatalogProduct>> {
    let raw = std::fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    let parsed: ProductsFile =
        toml::from_str(&raw).with_context(|| format!("parse {}", path.display()))?;
    Ok(parsed.product)
}

/// Load `catalog/news/YYYY-Www.json` snapshots into `news-week-*` documents (en).
fn load_news_weeks(dir: &Path) -> Result<Vec<Document>> {
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .with_context(|| format!("read dir {}", dir.display()))?
        .filter_map(Result::ok)
        .collect();
    entries.sort_by_key(std::fs::DirEntry::file_name);
    for entry in entries {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default();
        if !is_valid_week_id(stem) {
            anyhow::bail!(
                "news snapshot filename must be YYYY-Www.json: {}",
                path.display()
            );
        }
        let raw =
            std::fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        let body: serde_json::Value =
            serde_json::from_str(&raw).with_context(|| format!("parse {}", path.display()))?;
        if let Some(at) = body.get("fetched_at").and_then(serde_json::Value::as_str) {
            if let Some(from_payload) = week_id_from_fetched_at(at) {
                if from_payload != stem {
                    tracing::warn!(
                        file = %path.display(),
                        file_week = %stem,
                        payload_week = %from_payload,
                        "news snapshot week id differs from fetched_at ISO week"
                    );
                }
            }
        }
        let slug = news_week_slug(stem);
        out.push(Document {
            slug,
            lang: "en".into(),
            title: format!("News archive {stem}"),
            body: format_news_week_doc(stem, &body),
        });
    }
    Ok(out)
}

fn blurb_for<'a>(product: &'a CatalogProduct, lang: &str) -> &'a str {
    match lang {
        "nl" if !product.blurb_nl.is_empty() => &product.blurb_nl,
        "fr" if !product.blurb_fr.is_empty() => &product.blurb_fr,
        _ => &product.blurb_en,
    }
}

fn is_shipped_status(status: &str) -> bool {
    matches!(status, "shipped" | "beta")
}

fn is_wip_status(status: &str) -> bool {
    status == "wip"
}

fn render_product_lists(products: &[CatalogProduct]) -> Vec<Document> {
    let mut out = Vec::new();
    for lang in LANGS {
        out.push(render_product_doc(
            "products-shipped",
            lang,
            products,
            is_shipped_status,
            product_list_title(lang, true),
            product_list_intro(lang, true),
        ));
        out.push(render_product_doc(
            "products-wip",
            lang,
            products,
            is_wip_status,
            product_list_title(lang, false),
            product_list_intro(lang, false),
        ));
    }
    out
}

fn product_list_title(lang: &str, shipped: bool) -> String {
    match (lang, shipped) {
        ("nl", true) => "Gelanceerde producten".into(),
        ("nl", false) => "Projecten in ontwikkeling".into(),
        ("fr", true) => "Produits livrés".into(),
        ("fr", false) => "Projets en cours".into(),
        (_, true) => "Shipped products".into(),
        (_, false) => "Projects in progress".into(),
    }
}

fn product_list_intro(lang: &str, shipped: bool) -> &'static str {
    match (lang, shipped) {
        ("nl", true) => {
            "Publieke Interchouette ITC-producten en onderhouden repositories (status shipped of beta)."
        }
        ("nl", false) => {
            "Actieve ITC-projecten die nog geen afgerond product zijn (status wip)."
        }
        ("fr", true) => {
            "Produits publics Interchouette ITC et dépôts maintenus (statut shipped ou beta)."
        }
        ("fr", false) => {
            "Projets ITC actifs pas encore produits finis (statut wip)."
        }
        (_, true) => {
            "Public Interchouette ITC products and maintained repositories (shipped or beta)."
        }
        (_, false) => "Active ITC projects not yet finished products (wip status).",
    }
}

fn render_product_doc(
    slug: &str,
    lang: &str,
    products: &[CatalogProduct],
    keep: fn(&str) -> bool,
    title: String,
    intro: &str,
) -> Document {
    let mut body = String::new();
    body.push_str(intro);
    body.push_str("\n\n");
    let mut any = false;
    for product in products {
        if !keep(product.status.as_str()) {
            continue;
        }
        if !product.public && slug == "products-shipped" {
            continue;
        }
        any = true;
        let blurb = blurb_for(product, lang);
        let _ = writeln!(
            body,
            "- {} ({}): {} — {}",
            product.id, product.repo, blurb, product.url
        );
    }
    if !any {
        body.push_str("(none listed)\n");
    }
    body.push_str("\nDocker Hub: https://hub.docker.com/u/interchouette\n");
    Document {
        slug: slug.to_string(),
        lang: lang.to_string(),
        title,
        body: body.trim_end().to_string(),
    }
}

/// Default catalog directory beside the `mcp` crate manifest.
#[must_use]
pub fn default_catalog_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("catalog")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn build_default_catalog_produces_expected_slugs() {
        let dir = tempdir().unwrap();
        let db = dir.path().join("interchouette.db");
        build(&db, default_catalog_dir()).unwrap();
        let store = Store::open_readonly(&db).unwrap();
        let listed = store.list_docs().unwrap();
        assert!(listed.len() >= 30);
        assert!(listed.iter().any(|(s, l, _)| s == "itcy" && l == "en"));
        assert!(listed
            .iter()
            .any(|(s, l, _)| s == "products-shipped" && l == "en"));
        assert!(listed
            .iter()
            .any(|(s, l, _)| s == "products-wip" && l == "en"));
        assert!(listed
            .iter()
            .any(|(s, l, _)| s.starts_with("news-week-") && l == "en"));
        let shipped = store.get_by_slug("products-shipped", Some("en")).unwrap();
        assert!(shipped.unwrap().body.contains("itcy"));
        let wip = store.get_by_slug("products-wip", Some("en")).unwrap();
        assert!(wip.unwrap().body.contains("open-trading"));
    }
}

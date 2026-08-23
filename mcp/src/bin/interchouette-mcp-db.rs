//! Rebuild `db/interchouette.db` from `mcp/catalog/`.

use std::path::PathBuf;

use anyhow::Context;
use clap::Parser;

use interchouette_mcp::build_db;

#[derive(Debug, Parser)]
#[command(
    name = "interchouette-mcp-db",
    about = "Compile MCP catalog into interchouette.db"
)]
struct Args {
    /// Output SQLite path (default: repo db/interchouette.db).
    #[arg(default_value = "../db/interchouette.db")]
    db: PathBuf,
    /// Catalog directory (default: mcp/catalog).
    #[arg(long, default_value = "catalog")]
    catalog: PathBuf,
}

fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let catalog = if args.catalog.is_relative() {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(args.catalog)
    } else {
        args.catalog
    };
    let db = if args.db.is_relative() {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(args.db)
    } else {
        args.db
    };
    build_db::build(&db, &catalog).with_context(|| format!("build {}", db.display()))?;
    let store = interchouette_mcp::db::Store::open_readonly(&db)?;
    eprintln!("wrote {} documents to {}", store.doc_count()?, db.display());
    Ok(())
}

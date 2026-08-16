//! `interchouette-mcp` - Streamable HTTP knowledge MCP for Gregory Roussac / Interchouette.

use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;
use interchouette_mcp::server::{run_http, DEFAULT_HTTP_LISTEN};

#[derive(Debug, Parser)]
#[command(
    name = "interchouette-mcp",
    about = "Interchouette knowledge MCP (Streamable HTTP + SQLite FTS5)",
    version
)]
struct Cli {
    /// HTTP bind address (`PORT` on Render is mapped by the start command).
    #[arg(long, env = "MCP_LISTEN", default_value = DEFAULT_HTTP_LISTEN)]
    listen: String,

    /// Directory for knowledge.sqlite and bot.sqlite.
    #[arg(long, env = "DATA_DIR", default_value = "./data")]
    data_dir: PathBuf,

    /// Markdown corpus root (`en/`, `nl/`).
    #[arg(long, env = "KNOWLEDGE_DIR", default_value = "../knowledge")]
    knowledge_dir: PathBuf,

    /// Bearer token for `/v1/admin/knowledge*`.
    #[arg(long, env = "ADMIN_TOKEN")]
    admin_token: Option<String>,

    /// CORS allow origin for browser callers.
    #[arg(long, env = "CORS_ORIGIN", default_value = "https://interchouette.net")]
    cors_origin: String,
}

fn init_logging() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_ansi(false)
        .with_writer(std::io::stderr)
        .init();
}

#[tokio::main]
async fn main() -> Result<()> {
    init_logging();
    let cli = Cli::parse();
    tracing::info!(addr = %cli.listen, "interchouette-mcp starting");
    run_http(
        &cli.listen,
        cli.data_dir,
        cli.knowledge_dir,
        cli.admin_token,
        cli.cors_origin,
    )
    .await?;
    Ok(())
}

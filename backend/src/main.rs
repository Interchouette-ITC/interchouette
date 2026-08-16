//! `interchouette-mcp` - Streamable HTTP knowledge MCP for Gregory Roussac / Interchouette.

use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;
use interchouette_mcp::server::{run_http, DEFAULT_HTTP_LISTEN};

#[derive(Debug, Parser)]
#[command(
    name = "interchouette-mcp",
    about = "Interchouette knowledge MCP (Streamable HTTP + committed SQLite .db)",
    version
)]
struct Cli {
    /// HTTP bind address (`PORT` on Render is mapped by the start command).
    #[arg(long, env = "MCP_LISTEN", default_value = DEFAULT_HTTP_LISTEN)]
    listen: String,

    /// Committed read-only knowledge database.
    #[arg(long, env = "KNOWLEDGE_DB", default_value = "../db/interchouette.db")]
    knowledge_db: PathBuf,

    /// Directory for writable `bot.sqlite` only.
    #[arg(long, env = "DATA_DIR", default_value = "./data")]
    data_dir: PathBuf,

    /// CORS allow origin for browser callers.
    #[arg(long, env = "CORS_ORIGIN", default_value = "https://interchouette.net")]
    cors_origin: String,

    /// Comma-separated Host values allowed by the Streamable HTTP transport.
    #[arg(
        long,
        env = "MCP_ALLOWED_HOSTS",
        value_delimiter = ',',
        default_value = "localhost,127.0.0.1,::1,mcp.interchouette.net,interchouette-mcp-latest.onrender.com"
    )]
    allowed_hosts: Vec<String>,
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
    tracing::info!(
        addr = %cli.listen,
        db = %cli.knowledge_db.display(),
        hosts = ?cli.allowed_hosts,
        "interchouette-mcp starting"
    );
    run_http(
        &cli.listen,
        cli.knowledge_db,
        cli.data_dir,
        cli.cors_origin,
        cli.allowed_hosts,
    )
    .await?;
    Ok(())
}
